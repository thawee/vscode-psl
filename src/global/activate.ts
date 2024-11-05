import * as vscode from 'vscode';  
import { ZWR2CSVHandler } from './transform';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
		vscode.commands.registerCommand(
			'psl.globalToCSV', ZWR2CSVHandler,
		), 
	);
}