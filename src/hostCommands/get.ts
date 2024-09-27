import * as vscode from 'vscode';
import * as utils from './hostCommandUtils';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as environment from '../common/environment';
import { MumpsVirtualDocument } from '../language/mumps';
import { getObjectType } from '../mtm/utils';

const icon = utils.icons.GET;

export async function getElementHandler(context: utils.ExtensionCommandContext): Promise<void> {
	let c = utils.getFullContext(context);
	if (c.mode === utils.ContextMode.DIRECTORY) {
		let input = await promptUserForElement("",c.fsPath);
		if (input) return getElement(path.join(c.fsPath, input)).catch(() => { });
	}
	else if (c.mode === utils.ContextMode.FILE) {
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
		}
		let input = await promptUserForElement(selected, c.fsPath);
		if (!input) return;
		let extension = path.extname(input).replace('.', '');
		let description = utils.extensionToDescription[extension]
		let filters: { [name: string]: string[] } = {}
		filters[description] = [extension]
		let currentFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(c.fsPath))
		if (!currentFolder) return;
		let target
		let defaultDir = DIR_MAPPINGS[extension];
		if (defaultDir) {
			target = { fsPath: path.join(currentFolder.uri.fsPath, defaultDir, input) }
		}
		else {
			let defaultUri = vscode.Uri.file(path.join(currentFolder.uri.fsPath, input))
			target = await vscode.window.showSaveDialog({ defaultUri, filters: filters });
		}
		if (!target) return;
		return getElement(target.fsPath).catch(() => { });
	}
	else {
		let quickPick = await environment.workspaceQuickPick();
		if (!quickPick) return;
		let chosenEnv = quickPick;
		// support text selection on editor/output panel
		let input = "";
		const editor = vscode.window.activeTextEditor; 
		if(editor) {
			var selection = editor.selection; 
			input = editor.document.getText(selection);
		}
		input = await promptUserForElement(input,c.fsPath);
		if (!input) return;
		let extension = path.extname(input).replace('.', '');
		let description = utils.extensionToDescription[extension]
		let filters: { [name: string]: string[] } = {}
		filters[description] = [extension]
		let target
		let defaultDir = DIR_MAPPINGS[extension];
		if (defaultDir) {
			target = { fsPath: path.join(chosenEnv.fsPath, defaultDir, input) }
		}
		else {
			let defaultUri = vscode.Uri.file(path.join(chosenEnv.fsPath, input))
			target = await vscode.window.showSaveDialog({ defaultUri, filters: filters });
		}
		if (!target) return;
		return getElement(target.fsPath).catch(() => { });
	}
	return;
}

export async function getTableHandler(context: utils.ExtensionCommandContext) {
	let c = utils.getFullContext(context);
	if (c.mode === utils.ContextMode.DIRECTORY) {
		let input = await promptUserForTable();
		if (input) return getTable(input, c.fsPath, c.fsPath).catch(() => { });
	}
	else if (c.mode === utils.ContextMode.FILE) {
		let workspace = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(c.fsPath));
		if (!workspace) {
			// skeptical of this approach
			return;
		}
		let tableName = await promptUserForTable();
		if (!tableName) return;
		let tableDir = DIR_MAPPINGS['TABLE']
		let target;
		if (tableDir) {
			target = [{ fsPath: path.join(workspace.uri.fsPath, tableDir) }]
		}
		else {
			target = await vscode.window.showOpenDialog({ defaultUri: workspace.uri, canSelectFiles: false, canSelectFolders: true, canSelectMany: false, filters: { 'Table Directory': [] } });
		}
		if (!target) return;
		return getTable(tableName, target[0].fsPath, workspace.uri.fsPath).catch(() => { });
	}
	else {
		let quickPick = await environment.workspaceQuickPick();
		if (!quickPick) return;
		let chosenEnv = quickPick;
		let tableName = await promptUserForTable();
		if (!tableName) return;
		let tableDir = DIR_MAPPINGS['TABLE']
		let target;
		if (tableDir) {
			target = [{ fsPath: path.join(chosenEnv.description, tableDir) }]
		}
		else {
			target = await vscode.window.showOpenDialog({ defaultUri: vscode.Uri.file(chosenEnv.description), canSelectFiles: false, canSelectFolders: true, canSelectMany: false, filters: { 'Table Directory': [] } });
		}
		if (!target) return;
		return getTable(tableName, target[0].fsPath, chosenEnv.description).catch(() => { });
	}
	return;
}

export async function getCompiledCodeHandler(context: utils.ExtensionCommandContext): Promise<void> {
	let c = utils.getFullContext(context);
	if (c.mode === utils.ContextMode.FILE) {
		return getCompiledCode(c.fsPath).catch(() => {});
	}
	else if (c.mode === utils.ContextMode.DIRECTORY) {
		let files = await vscode.window.showOpenDialog({defaultUri: vscode.Uri.file(c.fsPath), canSelectMany: true, openLabel: 'Refresh'})
		if (!files) return;
		for (let fsPath of files.map(file => file.fsPath)) {
			await getCompiledCode(fsPath).catch(() => {});
		}
	}
	else {
		let quickPick = await environment.workspaceQuickPick();
		if (!quickPick) return;
		let chosenEnv = quickPick;
		let files = await vscode.window.showOpenDialog({defaultUri: vscode.Uri.file(chosenEnv.fsPath), canSelectMany: true, openLabel: 'Refresh'})
		if (!files) return;
		for (let fsPath of files.map(file => file.fsPath)) {
			await getCompiledCode(fsPath).catch(() => {})
		}
	}
	return;
}

async function getCompiledCode(fsPath: string) {
	if (!fs.statSync(fsPath).isFile()) return;
	let env: environment.EnvironmentConfig;
	const routineName = `${path.basename(fsPath).split('.')[0]}.m`;
	return utils.executeWithProgress(`${icon} ${path.basename(fsPath)} GET`, async () => {
		let envs;
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
		let choice = await utils.getCommandenvConfigQuickPick(envs);
		if (!choice) return;
		env = choice;
		utils.logger.info(`${utils.icons.WAIT} ${icon} ${routineName} GET COMPILED from ${env.name}`);
		let doc = await vscode.workspace.openTextDocument(fsPath);
		await doc.save();
		let connection = await utils.getConnection(env);
		let output = await connection.get(routineName);
		const uri = vscode.Uri.parse(`${MumpsVirtualDocument.schemes.compiled}:/${env.name}/${routineName}`);
		const virtualDocument = new MumpsVirtualDocument(routineName, output, uri);
		utils.logger.info(`${utils.icons.SUCCESS} ${icon} ${routineName} GET COMPILED from ${env.name} succeeded`);
		connection.close();
		vscode.window.showTextDocument(virtualDocument.uri, {preview: false});
	}).catch((e: Error) => {
		if (env && env.name) {
			utils.logger.error(`${utils.icons.ERROR} ${icon} error in ${env.name} ${e.message}`);
		}
		else {
			utils.logger.error(`${utils.icons.ERROR} ${icon} ${e.message}`);
		}
	})
}

async function getElement(fsPath: string) {
	let env;
	await utils.executeWithProgress(`${icon} ${path.basename(fsPath)} GET`, async () => {
		let envs;
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
		let choice = await utils.getCommandenvConfigQuickPick(envs);
		if (!choice) return;
		env = choice;
		utils.logger.info(`${utils.icons.WAIT} ${icon} ${path.basename(fsPath)} GET from ${env.name}`);
		let connection = await utils.getConnection(env);
		let output = await connection.get(fsPath);
		await fs.ensureDir(path.dirname(fsPath))
		await utils.writeFileWithSettings(fsPath, output);
		utils.logger.info(`${utils.icons.SUCCESS} ${icon} ${path.basename(fsPath)} GET from ${env.name} succeeded`);
		connection.close();
		await vscode.workspace.openTextDocument(fsPath).then(vscode.window.showTextDocument)
	}).catch((e: Error) => {
		if (env && env.name) {
			utils.logger.error(`${utils.icons.ERROR} ${icon} error in ${env.name} ${e.message}`);
		}
		else {
			utils.logger.error(`${utils.icons.ERROR} ${icon} ${e.message}`);
		}
	})
	return;
}

async function getTable(tableName: string, targetDirectory: string, workpacePath: string) {
	let env;
	await utils.executeWithProgress(`${icon} ${tableName} TABLE GET`, async () => {
		let envs;
		try {
			envs = await utils.getEnvironment(workpacePath);
		}
		catch (e) {
			utils.logger.error(`${utils.icons.ERROR} ${icon} Invalid environment configuration.`);
			return;
		}
		if (envs.length === 0) {
			utils.logger.error(`${utils.icons.ERROR} ${icon} No environments selected.`);
			return;
		}
		let choice = await utils.getCommandenvConfigQuickPick(envs);
		if (!choice) return;
		env = choice; utils.logger.info(`${utils.icons.WAIT} ${icon} ${tableName} TABLE GET from ${env.name}`);
		let connection = await utils.getConnection(env);
		let output = await connection.getTable(tableName.toUpperCase() + '.TBL');
		await fs.ensureDir(path.join(targetDirectory, tableName.toLowerCase()));
		let tableFiles = (await fs.readdir(targetDirectory)).filter(f => f.startsWith(tableName));
		for (let file of tableFiles) {
			await fs.remove(file);
		}
		const promises = output.split(String.fromCharCode(0)).map(content => {
			const contentArray = content.split(String.fromCharCode(1));
			const fileName = contentArray[0];
			const fileContent = contentArray[1];
			return utils.writeFileWithSettings(path.join(targetDirectory, tableName.toLowerCase(), fileName), fileContent);
		});
		await Promise.all(promises);
		utils.logger.info(`${utils.icons.SUCCESS} ${icon} ${tableName} TABLE GET from ${env.name} succeeded`);
		connection.close();
	}).catch((e: Error) => {
		if (env && env.name) {
			utils.logger.error(`${utils.icons.ERROR} ${icon} error in ${env.name} ${e.message}`);
		}
		else {
			utils.logger.error(`${utils.icons.ERROR} ${icon} ${e.message}`);
		}
	})
	return;
}

async function getSCAER(scaseq: string, targetDirectory: string) {
	let env;
	let fsPath = path.join(targetDirectory, scaseq + '.log')
	await utils.executeWithProgress(`${icon} ${scaseq} SCAER GET`, async () => {
		let envs;
		try {
			envs = await utils.getEnvironment(targetDirectory);
		}
		catch (e) {
			utils.logger.error(`${utils.icons.ERROR} ${icon} Invalid environment configuration.`);
			return;
		}
		if (envs.length === 0) {
			utils.logger.error(`${utils.icons.ERROR} ${icon} No environments selected.`);
			return;
		}
		let choice = await utils.getCommandenvConfigQuickPick(envs);
		if (!choice) return;
		env = choice;
		utils.logger.info(`${utils.icons.WAIT} ${icon} ${scaseq} SCAER GET from ${env.name}`);
		let connection = await utils.getConnection(env);
		let output = await connection.getSCAER(scaseq);
		await fs.ensureDir(path.dirname(fsPath))
		await utils.writeFileWithSettings(fsPath, output);
		utils.logger.info(`${utils.icons.SUCCESS} ${icon} ${scaseq} SCAER GET from ${env.name} succeeded`);
		connection.close();
		await vscode.workspace.openTextDocument(fsPath).then(vscode.window.showTextDocument)
	}).catch((e: Error) => {
		if (env && env.name) {
			utils.logger.error(`${utils.icons.ERROR} ${icon} error in ${env.name} ${e.message}`);
		}
		else {
			utils.logger.error(`${utils.icons.ERROR} ${icon} ${e.message}`);
		}
	})
	return;
}

function getElementTypes(quickpick: vscode.QuickPick<vscode.QuickPickItem>) {
	let topPickedTypes:string[] = ['PROC','BATCH','TRIG'];
	let supportedTypes:string[] = ['FKY','IDX','JFD','PPL','QRY','RPT','SCR'];
	let items: vscode.QuickPickItem[] = [];

	let item : vscode.QuickPickItem = {
		label: "Top Picked Types",
		description: "",
		alwaysShow: true,
		kind: vscode.QuickPickItemKind.Separator
		
	};
	items.push(item);

	topPickedTypes.forEach((typ) => {
		// to support type that cannot get list from host 
		let fileDetail = getObjectType(typ+"."+typ);
		let item : vscode.QuickPickItem = {
			label: typ,
			description: fileDetail.fileId,
			alwaysShow: true
			
		};
		items.push(item);
	});

	let sep2 : vscode.QuickPickItem = {
		label: "Other Supported Types",
		description: "",
		alwaysShow: true,
		kind: vscode.QuickPickItemKind.Separator
		
	};
	items.push(sep2);
	supportedTypes.forEach((typ) => {
		// to support type that cannot get list from host 
		let fileDetail = getObjectType(typ+"."+typ);
		let item : vscode.QuickPickItem = {
			label: typ,
			description: fileDetail.fileId,
			alwaysShow: true
			
		};
		items.push(item);
	});
	quickpick.items = items;
	
	return;
}

function getElementList(quickpick: vscode.QuickPick<vscode.QuickPickItem>, elmName: string, elmType: string, targetDirectory: string) {
	let env; 
    utils.executeWithProgress(`${icon} search ${elmType} for ${elmName}`, async () => {
		let envs;
		try {
			envs = await utils.getEnvironment(targetDirectory);
		}
		catch (e) {
			utils.logger.error(`${utils.icons.ERROR} ${icon} Invalid environment configuration.`);
			return;
		}
		if (envs.length === 0) {
			utils.logger.error(`${utils.icons.ERROR} ${icon} No environments selected.`);
			return;
		}
		let choice = await utils.getCommandenvConfigQuickPick(envs);
		if (!choice) return;
		env = choice;
		utils.logger.info(`${utils.icons.WAIT} ${icon} ${elmName}*.${elmType} SEARCH on ${env.name}`);
		let connection = await utils.getConnection(env);
		let sql = getSQLForElementList(elmName, elmType);
		if(sql) {
			let returnString = await connection.sqlQuery(sql); 
			utils.logger.info(`${utils.icons.SUCCESS} ${icon} ${elmName}*.${elmType} SEARCH on ${env.name} succeeded`);
			connection.close();
			if(returnString) {
				let items: vscode.QuickPickItem[] = [];
				let columnList: string[];
				let elmString: string[]; 
				columnList = returnString.split('\r\n');
				for (let i = 0; i < columnList.length; i++) {
					elmString = columnList[i].split('\t');
					let label = elmString[0]+"."+elmType;
					let desc = elmString[1];
					if('PROC' == elmType || 'BATCH' == elmType) {
						desc = elmString[2];
						desc = "["+elmString[1]+"] "+ desc;
					}else if(elmString.length ==3) {
						label = elmString[0]+"-"+elmString[1]+"."+elmType;
						desc = elmString[2];
					}
					let item : vscode.QuickPickItem = {
						label: label,
						description: desc,
						alwaysShow: true
					};
					items.push(item);
				}
				quickpick.items = items;
			}
		}else {
			// to support type that cannot get list from host 
			let fileDetail = getObjectType(elmName+"."+elmType);
			let item : vscode.QuickPickItem = {
				label: elmName+"."+elmType,
				description: fileDetail.fileId,
				alwaysShow: true
			};
			quickpick.items = [item];
		}
	}).catch((e: Error) => {
		if (env && env.name) {
			utils.logger.error(`${utils.icons.ERROR} ${icon} error in ${env.name} ${e.message}`);
		}
		else {
			utils.logger.error(`${utils.icons.ERROR} ${icon} ${e.message}`);
		}
	})
	return;
}

function getSQLForElementList(elmName: string, elmType: string) {
	let sql = "";
    if("DAT" == elmType) {
		sql = "SELECT FID, DES FROM DBTBL1 WHERE FID LIKE '"+elmName+"%'";
	}else if("FKY" == elmType) {
		// name : FID-FKEYS.FKY
		let names = elmName.split("-");
		let table = names[0];
		let tid = names[1];
		if(tid) {
			sql = "SELECT FID, FKEYS, FKEYS FROM DBTBL1F WHERE FID LIKE '"+table+"%' AND FKEYS LIKE '"+tid+"%'";
		}else {
			sql = "SELECT FID, FKEYS, FKEYS FROM DBTBL1F WHERE FID LIKE '"+table+"%'";
		}
	}else if("IDX" == elmType) {
		// name : FID-INDEXNM.IDX
		let names = elmName.split("-");
		let table = names[0];
		let tid = names[1];
		if(tid) {
			sql = "SELECT FID, INDEXNM, IDXDESC FROM DBTBL8 WHERE FID LIKE '"+table+"%' AND INDEXNM LIKE '"+tid+"%'";
		}else {
			sql = "SELECT FID, INDEXNM, IDXDESC FROM DBTBL8 WHERE FID LIKE '"+table+"%'";
		}
	}else if("JFD" == elmType) {
		// name : FID-INDEXNM.JFD
		let names = elmName.split("-");
		let table = names[0];
		let tid = names[1];
		if(tid) {
			sql = "SELECT PRITABLE, JRNID, DES FROM DBTBL9 WHERE PRITABLE LIKE '"+table+"%' AND JRNID LIKE '"+tid+"%'";
		}else {
			sql = "SELECT PRITABLE, JRNID, DES FROM DBTBL9 WHERE PRITABLE LIKE '"+table+"%'";
		}
    }else if("PPL" == elmType) {
		sql = "SELECT PID, DESC FROM DBTBL13 WHERE PID LIKE '"+elmName+"%'";
	}else if("PROC" == elmType) {
	   sql = "SELECT PROCID, PGM, DES FROM DBTBL25 WHERE PROCID LIKE '"+elmName+"%' OR PGM LIKE '"+elmName+"%'";
    }else if("BATCH" == elmType) {
		sql = "SELECT BCHID, PGM, DES FROM DBTBL33 WHERE BCHID LIKE '"+elmName+"%' OR PGM LIKE '"+elmName+"%'";
	}else if("QRY" == elmType) {
		sql = "SELECT QID, DESC FROM DBTBL4 WHERE QID LIKE '"+elmName+"%'";
	}else if("RPT" == elmType) {
		sql = "SELECT RID, DESC FROM DBTBL5H WHERE RID LIKE '"+elmName+"%'";
	}else if("SCR" == elmType) {
		sql = "SELECT SID, DES FROM DBTBL2 WHERE SID LIKE '"+elmName+"%'";
	}else if("TRIG" == elmType) {
		// name : TABLE-TRGID.TRIG
		let triggers = elmName.split("-");
		let table = triggers[0];
		let tid = triggers[1];
		if(tid) {
			sql = "SELECT TABLE, TRGID, DES FROM DBTBL7 WHERE TABLE LIKE '"+table+"%' AND TRGID LIKE '"+tid+"%'";
		}else {
			sql = "SELECT TABLE, TRGID, DES FROM DBTBL7 WHERE TABLE LIKE '"+table+"%'";
		}
	}
	return sql;
}

export async function getSCAERHandler(context: utils.ExtensionCommandContext) {
	let c = utils.getFullContext(context);
	if (c.mode === utils.ContextMode.DIRECTORY) {
		let input = await promptUserForSCAER("");
		if (input) return getSCAER(input, c.fsPath).catch(() => { });
	}
	else if (c.mode === utils.ContextMode.FILE) {
		let workspace = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(c.fsPath));
		if (!workspace) {
			// skeptical of this approach
			return;
		}
		const editor = vscode.window.activeTextEditor; 
		var selection = editor.selection; 
		var seq = editor.document.getText(selection);
       
		if (!seq) { 
			  // prompt for seq if not selected on editor
			seq = await promptUserForSCAER(seq); 
		}
		if (!seq) return;

		let scaerDir = DIR_MAPPINGS['SCAER']
		let target;
		if (scaerDir) {
			target = [{ fsPath: path.join(workspace.uri.fsPath, scaerDir) }]
		}
		else {
			target = await vscode.window.showOpenDialog({ defaultUri: workspace.uri, canSelectFiles: false, canSelectFolders: true, canSelectMany: false, filters: { 'SCAER Directory': [] } });
		}
		if (!target) return;
		return getSCAER(seq, target[0].fsPath).catch(() => { });
	}
	else {
		let quickPick = await environment.workspaceQuickPick();
		if (!quickPick) return;
		let chosenEnv = quickPick;
		// support text selection on editor/output panel
		let seq = "";
		const editor = vscode.window.activeTextEditor; 
		if(editor) {
			var selection = editor.selection; 
			seq = editor.document.getText(selection);
		}
		if (!seq) { 
			// prompt for seq if not selected on editor
		  seq = await promptUserForSCAER(seq); 
	    }
		if (!seq) return;
		let scaerDir = DIR_MAPPINGS['SCAER']
		let target;
		if (scaerDir) {
			target = [{ fsPath: path.join(chosenEnv.description, scaerDir) }]
		}
		else {
			target = await vscode.window.showOpenDialog({ defaultUri: vscode.Uri.file(chosenEnv.description), canSelectFiles: false, canSelectFolders: true, canSelectMany: false, filters: { 'SCAER Directory': [] } });
		}
		if (!target) return;
		return getSCAER(seq, target[0].fsPath).catch(() => { });
	}
	return;
}

async function promptUserForElement(input: string, targetDirectory: string):Promise<any> { 
	return new Promise((resolve) => {
		const quickpick = vscode.window.createQuickPick();
		quickpick.title = "Get Profile Element";
		quickpick.placeholder = "Element name and type (pick supported element type from list)";
		quickpick.canSelectMany = false;
		quickpick.ignoreFocusOut = true;
		quickpick.matchOnDescription = true;
        quickpick.matchOnDetail = true;
		quickpick.value = input;
		let searchMode:string = "TYPE";
		try {
			getElementTypes(quickpick)
		}catch (e) {}
		quickpick.onDidChangeValue(() => { 
			// INJECT procedure list into proposed values
			let separators: RegExp = /[:.]+/;
			let elmStrings = quickpick.value.split(separators); 
			let elm = elmStrings[0]?.trim();
			let ext = elmStrings[1]?.trim();
		
			if(quickpick.value.includes(':')) {
				// swap elm and type for :
				elm = elmStrings[1]?.trim();
				ext = elmStrings[0]?.trim();
			}
			quickpick.items = []; // reset quickpick items
			if(((!ext) && elm?.length >= 3) || (ext && elm?.length >= 1)) {
				if (!ext) {
					ext = "PROC";
				}
				
				quickpick.busy = true; 
				searchMode = "ELEMENT"; 
				try {
					getElementList(quickpick, elm, ext, targetDirectory)
				}catch (e) {}
				quickpick.busy = false;
			}else if(!ext) {
				// display supported element types
				quickpick.busy = true; 
				searchMode = "TYPE"; 
				try {
					getElementTypes(quickpick)
				}catch (e) {}
				quickpick.busy = false;
			} 
		});
		quickpick.onDidAccept(() =>{
			if("ELEMENT" === searchMode) {
				const selection = quickpick.activeItems[0]
            	resolve(selection.label)
            	quickpick.hide()
			}else {
				let oval = quickpick.value;
				const selection = quickpick.activeItems[0]
				quickpick.value = selection.label+": "+oval;
			}
		});
		quickpick.onDidHide(() => resolve(""));
		quickpick.show(); 
	 
	});
}

async function promptUserForTable() {
	let inputOptions: vscode.InputBoxOptions = {
		prompt: 'Name of Table (no extension)', 
		validateInput: (value: string) => {
			if (!value) return;
			if (value.includes('.')) return 'Do not include the extension';
		}
	};
	return vscode.window.showInputBox(inputOptions);
}

async function promptUserForSCAER(input: string) {
	let inputOptions: vscode.InputBoxOptions = {
		prompt: 'SEQ for SCAER log details', 
		value: input,
		validateInput: (value: string) => {
			if (!value) return;
			if (value.includes('.')) return 'Do not include the extension';
		}
	};
	return vscode.window.showInputBox(inputOptions);
}

const DIR_MAPPINGS = {
	'BATCH': 'dataqwik/batch',
	'COL': '',
	'DAT': 'data',
	'FKY': 'dataqwik/foreign_key',
	// 'G': 'Global',
	'IDX': 'dataqwik/index',
	'JFD': 'dataqwik/journal',
	'm': 'routine',
	'PPL': '',
	'PROC': 'dataqwik/procedure',
	'properties': 'property',
	'PSL': '',
	'psl': '',
	'pslx': '',
	'pslxtra': '',
	'psql': '',
	'QRY': 'dataqwik/query',
	'RPT': 'dataqwik/report',
	'SCR': 'dataqwik/screen',
	// TABLE not supported
	'TABLE': 'dataqwik/table',
	'TBL': '',
	'TRIG': 'dataqwik/trigger',
	'SCAER': 'errorlog',
}

export async function getProcId(targetDirectory: string, value: string):Promise<string> {
		let envs;
		try {
			envs = await utils.getEnvironment(targetDirectory);
		}
		catch (e) {
			utils.logger.error(`${utils.icons.ERROR} ${icon} Invalid environment configuration.`);
			return;
		}
		if (envs.length === 0) {
			utils.logger.error(`${utils.icons.ERROR} ${icon} No environments selected.`);
			return;
		}
		let choice = await utils.getCommandenvConfigQuickPick(envs);
		if (!choice) return;
		let env = choice; 
		let connection = await utils.getConnection(env);
		let sql = "SELECT PROCID FROM DBTBL25 WHERE PGM='"+value+"'";
		let output = await connection.sqlQuery(sql);

		return output;
}
