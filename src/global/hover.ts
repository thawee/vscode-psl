import * as vscode from 'vscode';

export const GLOBAL_MODE: vscode.DocumentFilter = { language: 'plaintext', scheme: 'file' };

export class GlobalHoverProvider implements vscode.HoverProvider { 
    public async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
            console.log('Hover provider triggered');
            // the text up to the cursor
		let textToPosition: string = document.getText(new vscode.Range(position.line, 0, position.line, position.character));

        // position of current data item
		let currentDataItemPosition: number = textToPosition.split('\t').length - 1;

		// full text of data item
		let dataItemText = document.lineAt(position.line).text.split('\t')[currentDataItemPosition];

        let prevTabPos: number = textToPosition.lastIndexOf('\t') + 1;
        let nextTabPos: number = prevTabPos + dataItemText.length;
            let content = new vscode.MarkdownString(`COLUMN: **Hover information for word**`);
            content.isTrusted = true;
			return new vscode.Hover(content, new vscode.Range(position.line, prevTabPos, position.line, nextTabPos))

         //   return undefined;
        } 
}
 