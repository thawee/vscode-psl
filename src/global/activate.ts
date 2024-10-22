import * as vscode from 'vscode'; 
import * as hover from './hover';
import { ZWR2CSVHandler } from './transform';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
		// Global Hovers
		vscode.languages.registerHoverProvider(
			hover.GLOBAL_MODE, new hover.GlobalHoverProvider(),
		),
		vscode.commands.registerCommand(
			'psl.globalToCSV', ZWR2CSVHandler,
		), 
	);
}