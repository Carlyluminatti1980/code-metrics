import Parser from 'tree-sitter';
import Java from 'tree-sitter-java';
import JavaScript from 'tree-sitter-javascript';
import Python from 'tree-sitter-python';
import * as vscode from 'vscode';
import {
  GREEN_THRESHOLD,
  LINE_COUNT_THRESHOLD,
  ORANGE_THRESHOLD,
  YELLOW_THRESHOLD,
} from './constants';
import { FunctionInfo, Language, SupportedLanguage } from './types';
const { tsx, typescript } = require('tree-sitter-typescript'); // Used require instead of import to avoid TypeScript error TS2714

export class CodeParser {
  private parser: Parser;
  private languageParsers: Record<SupportedLanguage, Language>;

  constructor() {
    this.parser = new Parser();
    this.languageParsers = {
      javascript: JavaScript,
      typescript: typescript,
      typescriptreact: tsx,
      python: Python,
      java: Java,
    };
  }

  // Your existing parseDocument function here
  parseDocument(document: vscode.TextDocument): FunctionInfo[] {
    const languageId = document.languageId as SupportedLanguage;

    if (!this.languageParsers[languageId]) {
      console.warn(`Unsupported language: ${languageId}`);
      return [];
    }

    this.parser.setLanguage(this.languageParsers[languageId]);
    const sourceCode = document.getText();
    const tree = this.parser.parse(sourceCode);

    const functionNodeTypes = this._getFunctionNodeTypes(languageId);
    const functions: FunctionInfo[] = [];

    tree.rootNode.descendantsOfType(functionNodeTypes).forEach((node) => {
      functions.push(this._analyzeFunctionNode(node, sourceCode, document, languageId));
    });

    return functions;
  }

  private _getFunctionNodeTypes(languageId: SupportedLanguage): string[] {
    switch (languageId) {
      case 'javascript':
      case 'typescript':
        return ['function_declaration', 'method_definition', 'arrow_function'];
      case 'python':
        return ['function_definition', 'lambda'];
      case 'java':
        return ['method_declaration', 'constructor_declaration'];
      default:
        return [];
    }
  }

  private _analyzeFunctionNode(
    node: Parser.SyntaxNode,
    sourceCode: string,
    document: vscode.TextDocument,
    languageId: SupportedLanguage
  ): FunctionInfo {
    const name = this.getFunctionName(node, languageId);

    const startPosition = node.startPosition;
    const endPosition = node.endPosition;
    const startLine = startPosition.row;
    const endLine = endPosition.row;
    const lineCount = endLine - startLine + 1;

    // let name: string;
    // if (node.type === 'arrow_function') {
    //   const parent = node.parent;
    //   if (parent?.type === 'variable_declarator') {
    //     name = parent.childForFieldName('name')?.text || '(anonymous)';
    //   } else if (parent?.type === 'pair' && parent.parent?.type === 'object') {
    //     name = parent.childForFieldName('key')?.text || '(anonymous)';
    //   } else {
    //     name = '(anonymous)';
    //   }
    // } else {
    //   name = node.childForFieldName('name')?.text || '(anonymous)';
    // }

    const currentThreshold =
      vscode.workspace.getConfiguration().get<number>('codeMetrics.lineCountThreshold') ||
      LINE_COUNT_THRESHOLD;
    const ratio = lineCount / currentThreshold;
    let color = 'green';

    if (ratio > ORANGE_THRESHOLD) color = 'red';
    else if (ratio > YELLOW_THRESHOLD) color = 'orange';
    else if (ratio > GREEN_THRESHOLD) color = 'yellow';

    return { name, lineCount, startLine: startLine + 1, endLine: endLine + 1, color };
  }

  private getFunctionName(node: Parser.SyntaxNode, languageId: SupportedLanguage): string {
    switch (languageId) {
      case 'javascript':
      case 'typescript':
        return this.getJavaScriptFunctionName(node);
      case 'python':
        return this.getPythonFunctionName(node);
      case 'java':
        return this.getJavaFunctionName(node);
      default:
        return '(unknown)';
    }
  }

  private getJavaScriptFunctionName(node: Parser.SyntaxNode): string {
    if (node.type === 'arrow_function') {
      const parent = node.parent;
      if (parent?.type === 'variable_declarator') {
        return parent.childForFieldName('name')?.text || '(anonymous)';
      } else if (parent?.type === 'pair' && parent.parent?.type === 'object') {
        return parent.childForFieldName('key')?.text || '(anonymous)';
      }
      return '(anonymous)';
    }
    return node.childForFieldName('name')?.text || '(anonymous)';
  }

  private getPythonFunctionName(node: Parser.SyntaxNode): string {
    if (node.type === 'lambda') {
      return '(lambda)';
    }
    return node.childForFieldName('name')?.text || '(anonymous)';
  }

  private getJavaFunctionName(node: Parser.SyntaxNode): string {
    if (node.type === 'constructor_declaration') {
      return '(constructor)';
    }
    return node.childForFieldName('name')?.text || '(anonymous)';
  }
}