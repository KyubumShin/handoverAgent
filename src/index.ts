import { Command } from 'commander';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { input } from '@inquirer/prompts';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { banner, success, info, warn, error, createSpinner, formatCitation, formatTable } from './cli/ui.js';
import { loadConfig, setConfig, getConfig } from './utils/config.js';
import { getDataDir, readJSON, writeJSON, ensureDir } from './utils/files.js';
import { initKnowledgeStore, addEntry, getAllEntries, getIndex } from './knowledge/store.js';
import { findRelevantEntries, getTopicSummary } from './knowledge/indexer.js';
import { KnowledgeExtractorAgent } from './agent/sub-agents/knowledge-extractor.js';
import { QAResponderAgent } from './agent/sub-agents/qa-responder.js';
import { GapAnalyzerAgent } from './agent/sub-agents/gap-analyzer.js';
import { startInteractiveSession } from './cli/interactive.js';
import { getFeedbackStats, loadFeedbackHistory } from './feedback/collector.js';
import { analyzeFeedback, detectQuestionPatterns, identifyWeakAreas } from './feedback/analyzer.js';
import { initSkillsDir, loadAllSkills, registerSkill, updateSkill } from './skills/registry.js';
import { SkillBuilderAgent } from './agent/sub-agents/skill-builder.js';
import type { HandoverConfig, HandoverProfile, HandoverType, Session } from './agent/types.js';

// --- Global error handling ---

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  error(`Unhandled error: ${message}`);
  process.exit(1);
});

/**
 * Check that ANTHROPIC_API_KEY is available. Exits with a helpful message if not.
 */
function requireApiKey(): void {
  const config = loadConfig();
  if (!config.apiKey && !process.env.ANTHROPIC_API_KEY) {
    error('Anthropic API key is required for this command.');
    info('Set it using one of these methods:');
    console.log('  export ANTHROPIC_API_KEY=sk-ant-...');
    console.log('  handover config apiKey sk-ant-... --global');
    process.exit(1);
  }
}

/**
 * Load and return the handover profile, or exit with a helpful message if not initialized.
 */
function requireProfile(): HandoverProfile {
  const dataDir = getDataDir();
  const profile = readJSON<HandoverProfile>(resolve(dataDir, 'profile.json'));
  if (!profile) {
    error('No handover initialized.');
    info('Run `handover init` first to create a handover profile.');
    process.exit(1);
  }
  return profile;
}

/**
 * Load all saved sessions from the sessions directory.
 */
function loadAllSessions(dataDir: string): Session[] {
  const sessionsDir = join(dataDir, 'sessions');
  ensureDir(sessionsDir);

  const files = readdirSync(sessionsDir).filter((f) => f.endsWith('.json'));
  const sessions: Session[] = [];

  for (const file of files) {
    const session = readJSON<Session>(join(sessionsDir, file));
    if (session) sessions.push(session);
  }

  return sessions;
}

const program = new Command();

program
  .name('handover')
  .description(
    'AI-powered CLI agent that helps people receiving handovers - project takeovers, role transitions, team onboarding',
  )
  .version('0.1.0');

// init command
program
  .command('init')
  .description('Initialize a new handover')
  .option('-t, --type <type>', 'Handover type: project, role, or team', 'project')
  .action(async (options: { type: string }) => {
    banner();

    const handoverType = options.type as HandoverType;
    if (!['project', 'role', 'team'].includes(handoverType)) {
      error(`Invalid handover type: ${options.type}. Must be project, role, or team.`);
      process.exit(1);
    }

    const name = await input({
      message: 'What is the name of this handover?',
    });

    if (!name.trim()) {
      error('Handover name is required.');
      process.exit(1);
    }

    const description = await input({
      message: 'Brief description (optional):',
      default: '',
    });

    const dataDir = getDataDir();

    // Create the handover profile
    const now = new Date().toISOString();
    const profile: HandoverProfile = {
      id: randomUUID(),
      type: handoverType,
      name: name.trim(),
      description: description.trim(),
      createdAt: now,
      updatedAt: now,
      sources: [],
      metadata: {},
    };

    // Save profile
    const profilePath = resolve(dataDir, 'profile.json');
    writeJSON(profilePath, profile);

    // Initialize knowledge store
    initKnowledgeStore(dataDir);

    success(`Handover "${profile.name}" initialized!`);
    info(`Type: ${profile.type}`);
    info(`ID: ${profile.id}`);
    info(`Data directory: ${dataDir}`);
    info('Run `handover extract <path>` to start extracting knowledge.');
  });

// extract command
program
  .command('extract <path>')
  .description('Extract knowledge from files or directories')
  .option('-d, --docs', 'Extract from documentation files')
  .option('-g, --git', 'Extract from git history')
  .option('--deep', 'Deep extraction (analyze file contents, not just structure)')
  .action(async (extractPath: string, options: { docs?: boolean; git?: boolean; deep?: boolean }) => {
    requireApiKey();
    const profile = requireProfile();
    const dataDir = getDataDir();

    // Initialize the knowledge store
    initKnowledgeStore(dataDir);

    const resolvedPath = resolve(extractPath);
    const depth = options.deep ? 'deep' : 'shallow';
    const extractor = new KnowledgeExtractorAgent();

    // Determine extraction type
    let extractionType: 'codebase' | 'docs' | 'git' = 'codebase';
    if (options.docs) extractionType = 'docs';
    else if (options.git) extractionType = 'git';

    const spinner = createSpinner(
      `Extracting ${extractionType} knowledge from ${resolvedPath}...`,
    );
    spinner.start();

    const result = await extractor.execute({
      path: resolvedPath,
      type: extractionType,
      depth,
    });

    spinner.stop();

    if (!result.success || !result.data) {
      error(`Extraction failed: ${result.error ?? 'Unknown error'}`);
      process.exit(1);
    }

    const { entries, summary, sourcesProcessed } = result.data;

    // Save entries to the knowledge store
    for (const entry of entries) {
      addEntry(entry);
    }

    // Update profile sources
    if (!profile.sources.includes(resolvedPath)) {
      profile.sources.push(resolvedPath);
      profile.updatedAt = new Date().toISOString();
      writeJSON(resolve(dataDir, 'profile.json'), profile);
    }

    success(summary);
    info(`Sources processed: ${sourcesProcessed}`);
    info(`Entries added: ${entries.length}`);

    const index = getIndex();
    info(`Total knowledge entries: ${index.totalEntries}`);
  });

// ask command (default)
program
  .command('ask [question]')
  .description('Interactive Q&A about the handover')
  .action(async (question?: string) => {
    if (!question) {
      // No question provided: start interactive session
      await startInteractiveSession();
      return;
    }

    // One-shot Q&A mode
    requireApiKey();
    const profile = requireProfile();
    const dataDir = getDataDir();

    // Initialize knowledge store
    initKnowledgeStore(dataDir);

    const spinner = createSpinner('Thinking...');
    spinner.start();

    try {
      const allEntries = getAllEntries();
      const relevantEntries = findRelevantEntries(question, allEntries);

      const qaAgent = new QAResponderAgent();
      const result = await qaAgent.execute({
        question,
        conversationHistory: [],
        knowledgeEntries: relevantEntries,
        handoverContext: [
          `Handover: ${profile.name}`,
          `Type: ${profile.type}`,
          `Description: ${profile.description}`,
        ].join('\n'),
      });

      spinner.stop();

      if (!result.success || !result.data) {
        error(result.error ?? 'Failed to generate an answer.');
        process.exit(1);
      }

      const { answer, citations, confidence, suggestedFollowUps } = result.data;

      // Display answer
      console.log('');
      console.log(answer);
      console.log('');

      // Display confidence
      const pct = Math.round(confidence * 100);
      info(`Confidence: ${pct}%`);

      // Display citations
      if (citations.length > 0) {
        console.log('');
        info('Sources:');
        for (const citation of citations) {
          console.log(formatCitation(citation));
          console.log('');
        }
      }

      // Display follow-ups
      if (suggestedFollowUps.length > 0) {
        console.log('');
        info('You might also ask:');
        for (const followUp of suggestedFollowUps) {
          console.log(`  - ${followUp}`);
        }
      }
    } catch (err) {
      spinner.stop();
      const message = err instanceof Error ? err.message : String(err);
      error(`Error: ${message}`);
      process.exit(1);
    }
  });

// status command
program
  .command('status')
  .description('Show handover progress and statistics')
  .action(() => {
    const profile = requireProfile();
    const dataDir = getDataDir();

    initKnowledgeStore(dataDir);
    const index = getIndex();
    const stats = getFeedbackStats();
    const topicSummary = getTopicSummary();

    banner();
    info(`Handover: ${profile.name} (${profile.type})`);
    info(`Created: ${profile.createdAt}`);
    info(`Sources: ${profile.sources.length}`);
    info(`Knowledge entries: ${index.totalEntries}`);

    // Show categories table
    if (topicSummary.size > 0) {
      info('Categories:');
      const rows: string[][] = [];
      for (const [category, count] of topicSummary) {
        rows.push([category, String(count)]);
      }
      console.log(formatTable(['Category', 'Entries'], rows));
    }

    info(
      `Feedback: ${stats.total} ratings (${Math.round(stats.rate * 100)}% positive)`,
    );
  });

// gaps command
program
  .command('gaps')
  .description('Show knowledge gaps analysis')
  .action(async () => {
    requireApiKey();
    const profile = requireProfile();
    const dataDir = getDataDir();

    initKnowledgeStore(dataDir);
    const entries = getAllEntries();
    const sessions = loadAllSessions(dataDir);

    if (entries.length === 0) {
      warn('No knowledge entries found. Run `handover extract <path>` first.');
      return;
    }

    const spinner = createSpinner('Analyzing knowledge gaps...');
    spinner.start();

    const analyzer = new GapAnalyzerAgent();
    const result = await analyzer.execute({ profile, entries, sessions });

    spinner.stop();

    if (!result.success || !result.data) {
      error(result.error ?? 'Gap analysis failed.');
      process.exit(1);
    }

    const { report } = result.data;

    // Display overall coverage
    banner();
    const coverageColor =
      report.overallCoverage >= 70
        ? chalk.green
        : report.overallCoverage >= 40
          ? chalk.yellow
          : chalk.red;
    info(`Overall Coverage: ${coverageColor(`${report.overallCoverage}%`)}`);
    console.log('');

    // Display gaps by importance
    if (report.gaps.length > 0) {
      info('Knowledge Gaps:');
      console.log('');

      const importanceOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const sortedGaps = [...report.gaps].sort(
        (a, b) => importanceOrder[a.importance] - importanceOrder[b.importance],
      );

      for (const gap of sortedGaps) {
        const importanceColor =
          gap.importance === 'critical'
            ? chalk.red.bold
            : gap.importance === 'high'
              ? chalk.yellow
              : gap.importance === 'medium'
                ? chalk.blue
                : chalk.dim;

        console.log(
          `  ${importanceColor(`[${gap.importance.toUpperCase()}]`)} ${chalk.bold(gap.topic)} ${chalk.dim(`(${gap.category})`)}`,
        );
        console.log(`    ${gap.reason}`);

        if (gap.suggestedQuestions.length > 0) {
          console.log(chalk.dim('    Suggested questions:'));
          for (const q of gap.suggestedQuestions) {
            console.log(chalk.dim(`      - ${q}`));
          }
        }
        console.log('');
      }
    } else {
      success('No significant gaps identified.');
      console.log('');
    }

    // Display recommendations
    if (report.recommendations.length > 0) {
      info('Recommendations:');
      for (const rec of report.recommendations) {
        console.log(`  - ${rec}`);
      }
      console.log('');
    }
  });

// map command
program
  .command('map')
  .description('Show knowledge map')
  .action(async () => {
    requireApiKey();
    const profile = requireProfile();
    const dataDir = getDataDir();

    initKnowledgeStore(dataDir);
    const entries = getAllEntries();
    const sessions = loadAllSessions(dataDir);

    if (entries.length === 0) {
      warn('No knowledge entries found. Run `handover extract <path>` first.');
      return;
    }

    const spinner = createSpinner('Building knowledge map...');
    spinner.start();

    const analyzer = new GapAnalyzerAgent();
    const result = await analyzer.execute({ profile, entries, sessions });

    spinner.stop();

    if (!result.success || !result.data) {
      error(result.error ?? 'Failed to build knowledge map.');
      process.exit(1);
    }

    const { report, knowledgeMap } = result.data;

    banner();
    info(`Knowledge Map: ${profile.name} (${profile.type})`);
    console.log('');

    // Display each category with a coverage bar
    const BAR_WIDTH = 20;
    const sortedMap = [...knowledgeMap].sort((a, b) => b.coverage - a.coverage);

    for (const item of sortedMap) {
      const filled = Math.round((item.coverage / 100) * BAR_WIDTH);
      const empty = BAR_WIDTH - filled;
      const barColor =
        item.coverage >= 70
          ? chalk.green
          : item.coverage >= 40
            ? chalk.yellow
            : chalk.red;
      const bar = barColor('\u2588'.repeat(filled)) + chalk.dim('\u2591'.repeat(empty));

      console.log(
        `  ${chalk.bold(item.category.padEnd(14))} ${bar} ${String(item.coverage).padStart(3)}%  (${item.entryCount} entries, ${item.questionsAsked} questions)`,
      );

      // Show topics under the category
      if (item.topics.length > 0) {
        const displayTopics = item.topics.slice(0, 5);
        for (const topic of displayTopics) {
          console.log(chalk.dim(`    - ${topic}`));
        }
        if (item.topics.length > 5) {
          console.log(chalk.dim(`    ... and ${item.topics.length - 5} more`));
        }
      }
      console.log('');
    }

    // Overall summary
    const coverageColor =
      report.overallCoverage >= 70
        ? chalk.green
        : report.overallCoverage >= 40
          ? chalk.yellow
          : chalk.red;
    info(`Overall Coverage: ${coverageColor(`${report.overallCoverage}%`)}`);
    info(`Total Entries: ${entries.length}`);
    info(`Sessions: ${sessions.length}`);
  });

// skills command
program
  .command('skills')
  .description('List available skills')
  .option('-e, --evolve', 'Evolve skills based on usage patterns')
  .action(async (options: { evolve?: boolean }) => {
    const dataDir = getDataDir();
    initSkillsDir(dataDir);

    if (options.evolve) {
      // Load feedback, sessions, and existing skills
      const feedbackHistory = loadFeedbackHistory();
      const sessions = loadAllSessions(dataDir);
      const existingSkills = loadAllSkills();

      if (feedbackHistory.length === 0 && sessions.length === 0) {
        warn('No feedback or session data available yet.');
        info('Use the interactive Q&A mode first to generate usage data, then run --evolve again.');
        return;
      }

      const spinner = createSpinner('Analyzing usage patterns and evolving skills...');
      spinner.start();

      try {
        // Run feedback analyzer
        const questionPatterns = detectQuestionPatterns(sessions);
        const weakAreas = identifyWeakAreas(feedbackHistory, sessions);
        const feedbackSummary = analyzeFeedback(feedbackHistory, sessions);

        // Run skill builder agent
        const builder = new SkillBuilderAgent();
        const result = await builder.execute({
          questionPatterns,
          weakAreas,
          existingSkills,
        });

        spinner.stop();

        if (!result.success || !result.data) {
          error(result.error ?? 'Skill evolution failed.');
          return;
        }

        const { newSkills, improvedSkills, summary } = result.data;

        // Register new skills
        for (const skill of newSkills) {
          registerSkill(skill);
        }

        // Apply improvements to existing skills
        for (const improvement of improvedSkills) {
          updateSkill(improvement.id, {});
        }

        // Display results
        success(summary);
        console.log('');

        if (newSkills.length > 0) {
          info('New skills created:');
          for (const skill of newSkills) {
            console.log(`  ${chalk.bold(skill.name)} (${skill.id})`);
            console.log(`    ${chalk.dim(skill.description)}`);
            console.log(`    Keywords: ${skill.trigger.keywords.join(', ')}`);
            console.log('');
          }
        }

        if (improvedSkills.length > 0) {
          info('Skills improved:');
          for (const improvement of improvedSkills) {
            console.log(`  ${chalk.bold(improvement.id)}: ${improvement.changes}`);
          }
          console.log('');
        }

        // Show feedback analysis summary
        if (feedbackSummary.totalInteractions > 0) {
          info('Feedback analysis:');
          console.log(`  Satisfaction rate: ${Math.round(feedbackSummary.satisfactionRate * 100)}%`);
          if (feedbackSummary.commonIssues.length > 0) {
            console.log(`  Common issues: ${feedbackSummary.commonIssues.slice(0, 5).join(', ')}`);
          }
          console.log('');
        }

        if (questionPatterns.length > 0) {
          info(`Detected ${questionPatterns.length} question pattern(s)`);
        }
        if (weakAreas.length > 0) {
          warn(`Found ${weakAreas.length} weak area(s) needing improvement`);
        }
      } catch (err) {
        spinner.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Evolution failed: ${message}`);
      }
    } else {
      // List all skills
      const skills = loadAllSkills();

      if (skills.length === 0) {
        info('No skills available.');
        return;
      }

      info(`Available skills (${skills.length}):`);
      console.log('');

      const rows = skills.map((skill) => [
        skill.name,
        skill.metadata.source,
        String(skill.metadata.usageCount),
        `${Math.round(skill.metadata.successRate * 100)}%`,
        skill.trigger.keywords.slice(0, 3).join(', '),
      ]);

      console.log(formatTable(
        ['Name', 'Source', 'Uses', 'Success', 'Keywords'],
        rows,
      ));
      console.log('');
      info('Run `handover skills --evolve` to create new skills from usage patterns.');
    }
  });

// feedback command
program
  .command('feedback')
  .description('View feedback summary')
  .action(() => {
    const stats = getFeedbackStats();

    if (stats.total === 0) {
      info('No feedback recorded yet.');
      info('Use /feedback in interactive mode to rate answers.');
      return;
    }

    info('Feedback Summary:');
    console.log(`  Total ratings:    ${stats.total}`);
    console.log(`  Positive:         ${stats.positive}`);
    console.log(`  Negative:         ${stats.negative}`);
    console.log(`  Satisfaction rate: ${Math.round(stats.rate * 100)}%`);
  });

// config command
program
  .command('config [key] [value]')
  .description('View or edit configuration')
  .option('-g, --global', 'Use global configuration')
  .action((key?: string, value?: string, options?: { global?: boolean }) => {
    if (!key) {
      // Show all config
      const config = loadConfig();
      info('Current configuration:');
      const displayConfig = { ...config };
      if (displayConfig.apiKey) {
        displayConfig.apiKey =
          displayConfig.apiKey.slice(0, 8) + '...' + displayConfig.apiKey.slice(-4);
      }
      for (const [k, v] of Object.entries(displayConfig)) {
        console.log(`  ${k}: ${JSON.stringify(v)}`);
      }
      return;
    }

    if (!value) {
      // Show specific key
      const configValue = getConfig(key as keyof HandoverConfig);
      if (configValue !== undefined) {
        let displayValue: unknown = configValue;
        if (key === 'apiKey' && typeof configValue === 'string') {
          displayValue = configValue.slice(0, 8) + '...' + configValue.slice(-4);
        }
        info(`${key}: ${JSON.stringify(displayValue)}`);
      } else {
        error(`Unknown config key: ${key}`);
      }
      return;
    }

    // Set config value
    const isGlobal = options?.global ?? false;
    let parsedValue: unknown = value;

    // Try to parse numbers and booleans
    if (value === 'true') parsedValue = true;
    else if (value === 'false') parsedValue = false;
    else if (!isNaN(Number(value)) && value.trim() !== '') parsedValue = Number(value);

    setConfig(key as keyof HandoverConfig, parsedValue as never, isGlobal);
    success(`Set ${key} = ${JSON.stringify(parsedValue)}${isGlobal ? ' (global)' : ''}`);
  });

// Default action: show banner + help
program.action(() => {
  banner();
  program.outputHelp();
});

try {
  program.parse();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  error(`Fatal error: ${message}`);
  process.exit(1);
}
