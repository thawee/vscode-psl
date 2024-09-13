import * as fs from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import * as environment from '../common/environment';
import * as utils from './hostCommandUtils';

const icon = utils.icons.RUN;

export async function runSQLHandler(context: utils.ExtensionCommandContext): Promise<void> {
	handle(context);
}

async function handle(context: utils.ExtensionCommandContext): Promise<void> {
	const c = utils.getFullContext(context);
	if (c.mode === utils.ContextMode.FILE) {
		let workspace = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(c.fsPath));
		if (!workspace) {
			// skeptical of this approach
			return;
		}
		// support text selection on editor/output panel
		let selected:string = "";
		const editor = vscode.window.activeTextEditor; 
		if(editor) {
			const selection = editor.selection; 
			selected = editor.document.getText(selection);

			return runSQL(c.fsPath, selected).catch(() => { });
		}
	} 
	return;
}

async function runSQL(fsPath: string, sql: string) {  
	let envs: environment.EnvironmentConfig[];
	try {
		envs = await utils.getEnvironment(fsPath);
	}
	catch (e) {
		utils.logger.error(`${utils.icons.ERROR} ${icon} Invalid environment configuration.`);
		return;
	}
	if (envs.length === 0) {
		utils.logger.error(`${utils.icons.ERROR} ${icon} No environments selected.`);
		return;
	}
	const promises = [];
	for (const env of envs) {
		promises.push(utils.executeWithProgress(`${icon} SQL RUN`, async () => {
			utils.logger.info(`${utils.icons.WAIT} ${icon} SQL RUN in ${env.name}`);
			const connection = await utils.getConnection(env);
			const output: string = await connection.sqlQuery(sql);
			connection.close();
			utils.logger.info(output.trim());
		}).catch((e: Error) => {
			utils.logger.error(`${utils.icons.ERROR} ${icon} error in ${env.name} ${e.message}`);
		}));
	}
	await Promise.all(promises);
}
