import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

export interface SourceContract {
  filePath: string;
  text: string;
  normalizedText: string;
  sourceFile: ts.SourceFile;
}

interface FunctionScopeOptions {
  withinFunction?: string;
}

interface FindCallOptions extends FunctionScopeOptions {
  callee: string;
  stringArgument?: {
    index: number;
    value: string;
  };
}

interface ObjectArgumentOptions {
  unwrapCall?: string;
}

type PropertyExpectation = true | string | RegExp;

function normalizeSourceSnippet(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function resolveContractPath(filePathOrUrl: string | URL): string {
  if (filePathOrUrl instanceof URL) {
    return fileURLToPath(filePathOrUrl);
  }

  return resolve(filePathOrUrl);
}

function detectScriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }

  if (filePath.endsWith(".jsx")) {
    return ts.ScriptKind.JSX;
  }

  if (filePath.endsWith(".js")) {
    return ts.ScriptKind.JS;
  }

  return ts.ScriptKind.TS;
}

function visitDescendants(node: ts.Node, visitor: (child: ts.Node) => void): void {
  const visit = (current: ts.Node) => {
    visitor(current);
    current.forEachChild(visit);
  };

  visit(node);
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;

  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}

function findNamedScope(contract: SourceContract, name: string): ts.Node {
  let match: ts.Node | null = null;

  visitDescendants(contract.sourceFile, (node) => {
    if (match) {
      return;
    }

    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      match = node;
      return;
    }

    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      match = node;
      return;
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      match = node.initializer;
    }
  });

  assert.ok(match, `Expected to find function scope "${name}" in ${contract.filePath}`);
  return match;
}

function getSearchRoot(contract: SourceContract, options?: FunctionScopeOptions): ts.Node {
  if (!options?.withinFunction) {
    return contract.sourceFile;
  }

  return findNamedScope(contract, options.withinFunction);
}

function normalizeNodeText(contract: SourceContract, node: ts.Node): string {
  return normalizeSourceSnippet(node.getText(contract.sourceFile));
}

function getCallArgumentObjectLiteral(
  contract: SourceContract,
  call: ts.CallExpression,
  argumentIndex: number,
  options?: ObjectArgumentOptions
): ts.ObjectLiteralExpression {
  const argument = call.arguments[argumentIndex];
  assert.ok(
    argument,
    `Expected call "${normalizeNodeText(contract, call.expression)}" to have argument ${argumentIndex} in ${contract.filePath}`
  );

  let expression = unwrapExpression(argument);

  if (options?.unwrapCall) {
    assert.ok(
      ts.isCallExpression(expression),
      `Expected argument ${argumentIndex} in ${contract.filePath} to be wrapped by ${options.unwrapCall}(...)`
    );
    assert.equal(
      normalizeNodeText(contract, expression.expression),
      normalizeSourceSnippet(options.unwrapCall),
      `Expected wrapper call "${options.unwrapCall}" in ${contract.filePath}`
    );
    const innerArgument = expression.arguments[0];
    assert.ok(innerArgument, `Expected ${options.unwrapCall}(...) to receive an object literal in ${contract.filePath}`);
    expression = unwrapExpression(innerArgument);
  }

  assert.ok(
    ts.isObjectLiteralExpression(expression),
    `Expected argument ${argumentIndex} to resolve to an object literal in ${contract.filePath}`
  );

  return expression;
}

function getPropertyMap(objectLiteral: ts.ObjectLiteralExpression): Map<string, ts.ObjectLiteralElementLike> {
  const properties = new Map<string, ts.ObjectLiteralElementLike>();

  for (const property of objectLiteral.properties) {
    if (!("name" in property) || !property.name) {
      continue;
    }

    if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
      properties.set(property.name.text, property);
    }
  }

  return properties;
}

function getPropertyInitializer(
  contract: SourceContract,
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string
): ts.Expression {
  const property = getPropertyMap(objectLiteral).get(propertyName);
  assert.ok(property, `Expected property "${propertyName}" in ${contract.filePath}`);

  if (ts.isShorthandPropertyAssignment(property)) {
    return property.name;
  }

  assert.ok(
    ts.isPropertyAssignment(property),
    `Expected property "${propertyName}" to be an assignment in ${contract.filePath}`
  );

  return unwrapExpression(property.initializer);
}

function getStringArgument(call: ts.CallExpression, index: number): string | null {
  const argument = call.arguments[index];
  if (!argument) {
    return null;
  }

  const unwrapped = unwrapExpression(argument);
  return ts.isStringLiteral(unwrapped) || ts.isNoSubstitutionTemplateLiteral(unwrapped)
    ? unwrapped.text
    : null;
}

export function loadSourceContract(filePathOrUrl: string | URL): SourceContract {
  const filePath = resolveContractPath(filePathOrUrl);
  const text = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    detectScriptKind(filePath)
  );

  return {
    filePath,
    text,
    normalizedText: normalizeSourceSnippet(text),
    sourceFile,
  };
}

export function findCall(contract: SourceContract, options: FindCallOptions): ts.CallExpression {
  const searchRoot = getSearchRoot(contract, options);
  let match: ts.CallExpression | null = null;
  const expectedCallee = normalizeSourceSnippet(options.callee);

  visitDescendants(searchRoot, (node) => {
    if (match || !ts.isCallExpression(node)) {
      return;
    }

    if (normalizeNodeText(contract, node.expression) !== expectedCallee) {
      return;
    }

    if (options.stringArgument) {
      const actualValue = getStringArgument(node, options.stringArgument.index);
      if (actualValue !== options.stringArgument.value) {
        return;
      }
    }

    match = node;
  });

  assert.ok(
    match,
    `Expected to find call "${options.callee}"${options.withinFunction ? ` inside ${options.withinFunction}` : ""} in ${contract.filePath}`
  );
  return match;
}

export function findVariableDeclaration(
  contract: SourceContract,
  variableName: string,
  options?: FunctionScopeOptions
): ts.VariableDeclaration {
  const searchRoot = getSearchRoot(contract, options);
  let match: ts.VariableDeclaration | null = null;

  visitDescendants(searchRoot, (node) => {
    if (match || !ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || node.name.text !== variableName) {
      return;
    }

    match = node;
  });

  assert.ok(
    match,
    `Expected to find variable "${variableName}"${options?.withinFunction ? ` inside ${options.withinFunction}` : ""} in ${contract.filePath}`
  );
  return match;
}

export function getVariableInitializerObject(
  contract: SourceContract,
  variableName: string,
  options?: FunctionScopeOptions & ObjectArgumentOptions
): ts.ObjectLiteralExpression {
  const declaration = findVariableDeclaration(contract, variableName, options);
  assert.ok(declaration.initializer, `Expected variable "${variableName}" to have an initializer in ${contract.filePath}`);

  let initializer = unwrapExpression(declaration.initializer);

  if (options?.unwrapCall) {
    assert.ok(
      ts.isCallExpression(initializer),
      `Expected "${variableName}" initializer to be wrapped by ${options.unwrapCall}(...) in ${contract.filePath}`
    );
    assert.equal(
      normalizeNodeText(contract, initializer.expression),
      normalizeSourceSnippet(options.unwrapCall),
      `Expected wrapper call "${options.unwrapCall}" in ${contract.filePath}`
    );
    const innerArgument = initializer.arguments[0];
    assert.ok(innerArgument, `Expected ${options.unwrapCall}(...) to receive an object literal in ${contract.filePath}`);
    initializer = unwrapExpression(innerArgument);
  }

  assert.ok(
    ts.isObjectLiteralExpression(initializer),
    `Expected "${variableName}" initializer to be an object literal in ${contract.filePath}`
  );
  return initializer;
}

export function getNestedObjectLiteral(
  contract: SourceContract,
  objectLiteral: ts.ObjectLiteralExpression,
  propertyPath: string[]
): ts.ObjectLiteralExpression {
  let current = objectLiteral;

  for (const propertyName of propertyPath) {
    const initializer = getPropertyInitializer(contract, current, propertyName);
    assert.ok(
      ts.isObjectLiteralExpression(initializer),
      `Expected property "${propertyName}" in ${contract.filePath} to be an object literal`
    );
    current = initializer;
  }

  return current;
}

export function assertObjectProperties(
  contract: SourceContract,
  objectLiteral: ts.ObjectLiteralExpression,
  expectations: Record<string, PropertyExpectation>
): void {
  for (const [propertyName, expected] of Object.entries(expectations)) {
    const initializer = getPropertyInitializer(contract, objectLiteral, propertyName);

    if (expected === true) {
      continue;
    }

    const actualText = normalizeNodeText(contract, initializer);
    if (expected instanceof RegExp) {
      assert.match(actualText, expected, `Unexpected initializer for "${propertyName}" in ${contract.filePath}`);
      continue;
    }

    assert.equal(
      actualText,
      normalizeSourceSnippet(expected),
      `Unexpected initializer for "${propertyName}" in ${contract.filePath}`
    );
  }
}

export function assertCallArgumentObjectProperties(
  contract: SourceContract,
  options: FindCallOptions & {
    argumentIndex: number;
    propertyPath?: string[];
    expectations: Record<string, PropertyExpectation>;
    unwrapCall?: string;
  }
): void {
  const call = findCall(contract, options);
  let objectLiteral = getCallArgumentObjectLiteral(contract, call, options.argumentIndex, {
    unwrapCall: options.unwrapCall,
  });

  if (options.propertyPath && options.propertyPath.length > 0) {
    objectLiteral = getNestedObjectLiteral(contract, objectLiteral, options.propertyPath);
  }

  assertObjectProperties(contract, objectLiteral, options.expectations);
}

export function assertVariableObjectProperties(
  contract: SourceContract,
  variableName: string,
  expectations: Record<string, PropertyExpectation>,
  options?: FunctionScopeOptions & ObjectArgumentOptions
): void {
  const objectLiteral = getVariableInitializerObject(contract, variableName, options);
  assertObjectProperties(contract, objectLiteral, expectations);
}

export function assertCallStringArguments(
  contract: SourceContract,
  options: FunctionScopeOptions & {
    callee: string;
    values: string[];
    argumentIndex?: number;
  }
): void {
  const searchRoot = getSearchRoot(contract, options);
  const actualValues = new Set<string>();
  const expectedCallee = normalizeSourceSnippet(options.callee);
  const argumentIndex = options.argumentIndex ?? 0;

  visitDescendants(searchRoot, (node) => {
    if (!ts.isCallExpression(node)) {
      return;
    }

    if (normalizeNodeText(contract, node.expression) !== expectedCallee) {
      return;
    }

    const value = getStringArgument(node, argumentIndex);
    if (value) {
      actualValues.add(value);
    }
  });

  for (const value of options.values) {
    assert.ok(
      actualValues.has(value),
      `Expected ${options.callee}(..., "${value}")${options.withinFunction ? ` inside ${options.withinFunction}` : ""} in ${contract.filePath}`
    );
  }
}

export function assertJsxText(contract: SourceContract, texts: string[]): void {
  const actualTexts = new Set<string>();

  visitDescendants(contract.sourceFile, (node) => {
    if (ts.isJsxText(node)) {
      const text = node.getFullText(contract.sourceFile).replace(/\s+/g, " ").trim();
      if (text) {
        actualTexts.add(text);
      }
      return;
    }

    if (
      ts.isJsxAttribute(node) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    ) {
      actualTexts.add(node.initializer.text);
    }
  });

  for (const text of texts) {
    assert.ok(actualTexts.has(text), `Expected JSX text "${text}" in ${contract.filePath}`);
  }
}

export function assertJsxExpressionReferences(contract: SourceContract, expressions: string[]): void {
  const actualExpressions = new Set<string>();

  visitDescendants(contract.sourceFile, (node) => {
    if (!ts.isJsxExpression(node) || !node.expression) {
      return;
    }

    actualExpressions.add(normalizeNodeText(contract, node.expression));
  });

  for (const expression of expressions) {
    assert.ok(
      actualExpressions.has(normalizeSourceSnippet(expression)),
      `Expected JSX expression "${expression}" in ${contract.filePath}`
    );
  }
}

export function assertNormalizedFragments(
  contract: SourceContract,
  fragments: string[],
  context = "normalized source"
): void {
  // Narrow fallback for formatting-heavy strings where AST lookup does not represent
  // the user-visible line faithfully enough (for example CLI trace templates).
  for (const fragment of fragments) {
    assert.ok(
      contract.normalizedText.includes(normalizeSourceSnippet(fragment)),
      `Expected ${context} fragment "${fragment}" in ${contract.filePath}`
    );
  }
}

export function assertNoNormalizedFragments(contract: SourceContract, fragments: string[]): void {
  for (const fragment of fragments) {
    assert.equal(
      contract.normalizedText.includes(normalizeSourceSnippet(fragment)),
      false,
      `Did not expect normalized source fragment "${fragment}" in ${contract.filePath}`
    );
  }
}
