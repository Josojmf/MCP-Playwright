import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import * as messages from '@cucumber/messages';
import { TranslatedAssertion, translateAssertion } from './translator';

export interface ParsedStep {
  keyword: string;
  canonicalType: 'given' | 'when' | 'then';
  text: string;
  assertion?: TranslatedAssertion;
  arguments?: readonly (messages.DataTable | messages.DocString)[];
}

export interface ScenarioPlan {
  id: string;
  name: string;
  tags: string[];
  steps: ParsedStep[];
}

export class GherkinParserService {
  /**
   * Parses a raw Gherkin string into a flat list of Concrete Scenarios.
   * - Normalizes Windows CRLF to LF
   * - Prepends Background steps
   * - Expands Scenario Outlines into concrete Scenarios
   * - Resolves canonical types for And/But steps
   */
  public parseFeature(featureSource: string): ScenarioPlan[] {
    // 1. CRLF -> LF (GHERKIN-01)
    const normalizedSource = featureSource.replace(/\r\n?/g, '\n');

    const uuidFn = messages.IdGenerator.uuid();
    const builder = new AstBuilder(uuidFn);
    const matcher = new GherkinClassicTokenMatcher(); // English dialect
    const parser = new Parser(builder, matcher);

    const document = parser.parse(normalizedSource);
    
    if (!document.feature) {
      return [];
    }

    const scenarios: ScenarioPlan[] = [];
    const backgroundSteps: messages.Step[] = [];

    // Parse logic iteration
    for (const child of document.feature.children) {
      if (child.background) {
        backgroundSteps.push(...child.background.steps);
      } else if (child.scenario) {
        // Handle Scenario Outlines vs Standard Scenarios
        const parsedScenarios = this.expandScenario(child.scenario);
        
        parsedScenarios.forEach(scen => {
          const mutableSteps = [...scen.steps];
          mutableSteps.unshift(...backgroundSteps);
          scen.steps = mutableSteps as unknown as readonly messages.Step[];
          const mapped = this.mapToPlan(scen, this.mergeTags(document.feature?.tags, scen.tags));
          scenarios.push(mapped);
        });
      }
    }

    return scenarios;
  }

  private expandScenario(scenario: messages.Scenario): messages.Scenario[] {
    if (!scenario.examples || scenario.examples.length === 0) {
      return [scenario]; // Standard Scenario
    }

    const concreteScenarios: messages.Scenario[] = [];
    for (const example of scenario.examples) {
      if (!example.tableBody) continue;
      const headers = example.tableHeader?.cells.map(c => c.value);
      if (!headers) continue;

      for (const row of example.tableBody) {
        const rowValues = row.cells.map(c => c.value);
        // Duplicate steps, substituting `<header>` with actual `rowValues`
        const concreteSteps = scenario.steps.map(step => {
          let replacedText = step.text;
          headers.forEach((header, idx) => {
            replacedText = replacedText.replace(
              new RegExp(`<${this.escapeRegExp(header)}>`, 'g'),
              rowValues[idx]
            );
          });
          return { ...step, text: replacedText };
        });

        concreteScenarios.push({
          ...scenario,
          id: row.id,
          name: `${scenario.name} (Example: ${rowValues.join(', ')})`,
          tags: [...(scenario.tags || []), ...(example.tags || [])],
          steps: concreteSteps
        });
      }
    }
    return concreteScenarios;
  }

  private mapToPlan(scenario: messages.Scenario, tags: readonly messages.Tag[]): ScenarioPlan {
    let currentCanonical: 'given' | 'when' | 'then' = 'given'; // default
    
    const parsedSteps: ParsedStep[] = scenario.steps.map(step => {
      const normalizedKeyword = step.keyword.trim().toLowerCase();
      const primaryKeyword = this.resolvePrimaryKeyword(normalizedKeyword);
      if (primaryKeyword) {
        currentCanonical = primaryKeyword;
      }

      // If it's And / But, it inherits the 'currentCanonical'
      return {
        keyword: step.keyword.trim(),
        canonicalType: currentCanonical,
        text: step.text,
        assertion: currentCanonical === 'then' ? translateAssertion(step.text) : undefined,
        arguments: step.dataTable ? [step.dataTable] : (step.docString ? [step.docString] : undefined)
      };
    });

    return {
      id: scenario.id,
      name: scenario.name,
      tags: tags.map(t => t.name),
      steps: parsedSteps
    };
  }

  private mergeTags(featureTags?: readonly messages.Tag[], scenarioTags?: readonly messages.Tag[]): readonly messages.Tag[] {
    return [...(featureTags || []), ...(scenarioTags || [])];
  }

  private resolvePrimaryKeyword(keyword: string): 'given' | 'when' | 'then' | null {
    if (keyword.startsWith('given')) return 'given';
    if (keyword.startsWith('when')) return 'when';
    if (keyword.startsWith('then')) return 'then';
    return null;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
