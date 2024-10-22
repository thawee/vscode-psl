import * as vscode from 'vscode';
import * as fs from 'fs'; 
import * as utils from '../hostCommands/hostCommandUtils';

export async function ZWR2CSVHandler(context: utils.ExtensionCommandContext): Promise<void> {
    const editor = vscode.window.activeTextEditor; 
		if(editor) {
			 
             let document = editor.document;
             let fileName = document.fileName;
             let text = document.getText();
            utils.logger.info(`transform ${fileName} to CSV files`); 
           const fileStreams: { [key: string]: fs.WriteStream } = {};
             
           // Split the text by either \r\n or \n
             //let lines = text.split('\r\n');
             let lines = text.split(/\r?\n/);
    
             let keys = '';
             let global = "";
             let endLine = '';
            lines.forEach((line, index) => {
                if (line.startsWith('Global ^')) {
                    //let regex = /^Global \^(\w+)\((.+)\,$/;
                    let regex = /^Global \^(\w+)\((.+)$/;
                    let match = line.match(regex);

                    if (match) {
                        global = match[1];
                        keys = match[2] || '';
                    }
                } else if (line.startsWith('^')) {
                    // Use a regular expression to match the pattern and capture the values
                    let regex = /^\^.*\(([^)]+)\)=(.+)$/;
                    let match = line.match(regex);
                    if (match && match.length == 3) {
                        // Extract the captured groups
                        let part1 = match[1]; // "111,222,333" 
                        let part2 = match[2]; // "555|888|\"AA\"" 
                        
                        // Split the parts into arrays
                        let part1Values = part1.split(',');
                        let keyValues = part1.split(',');
                        let part2Values = part2.split('|');

                        // Remove the last element
                        keyValues.pop();

                        // Join the remaining elements
                        keys = keyValues.join(',');
    
                        // Combine both parts into a single array
                        let values = part1Values.concat(part2Values);
                        
                        // Join the array into the desired format
                        let result = arrayToCSVLine(values); //values.join(',');

                        global = getGlobal(match[0]);

                        if (!fileStreams[global]) {
                            let filePath = getFileName(fileName, global);
                            fileStreams[global] = fs.createWriteStream(filePath, { flags: 'w' });
                        }
                
                        fileStreams[global].write(endLine+result);
                        endLine = '\n'; 
                    }
                }else if (line.startsWith(' ') && keys) {
                    let regex = /^(.+?)\)=(.+)$/;
                    line = line.trimStart();
                    let match = line.match(regex);
                    if (match) {
                        // Extract the captured groups
                        let part1 = match[1]; // "111,222,333"
                        let part2 = match[2]; // "555|888|\"AA\"" 
                        // Extract the captured groups
                        if(keys) {
                            part1 = keys+","+part1; // "111,222,333"
                        }
                        
                        // Split the parts into arrays
                        let part1Values = part1.split(',');
                        let part2Values = part2.split('|');

                        // Combine both parts into a single array
                        let values = part1Values.concat(part2Values);
                        
                        // Join the array into the desired format
                        let result = arrayToCSVLine(values); // values.join(','); 

                        if (!fileStreams[global]) {
                            let filePath = getFileName(fileName, global);
                            fileStreams[global] = fs.createWriteStream(filePath, { flags: 'w' });
                        }
                
                        fileStreams[global].write(endLine+result);
                        endLine = '\n'; 
                    }
                }else if (line && global && keys) {
                    let part2Values = line.split('|');
                    // Join the array into the desired format
                    let result = arrayToCSVLine(part2Values);
                    fileStreams[global].write(result);
                }
            });

            // Close all streams
            Object.values(fileStreams).forEach(stream => stream.end(() => {
                utils.logger.info(`Finished writing to ${stream.path}`);
                vscode.workspace.openTextDocument(stream.path.toString()).then(vscode.window.showTextDocument);
            })); 
        }
}

function arrayToCSVLine(arr: string[]): string {
    return arr.map(item => {
        // Remove existing wrapping quotes if present
        if ((item.startsWith('"') && item.endsWith('"')) || (item.startsWith("'") && item.endsWith("'"))) {
            item = item.slice(1, -1);
        }

        // Escape double quotes by replacing " with ""
        let escapedItem = item.replace(/"/g, '""');
        
        // If the item contains a comma, double quote, single quote, space, or line break, wrap it in double quotes
        if (/[",'\n ]/.test(escapedItem)) {
            escapedItem = `"${escapedItem}"`;
        }
        
        return escapedItem;
    }).join(','); // Join elements with commas for a single line
}

 function getGlobal(line:string) : string {  
    let regex = /^\^([A-Z0-9]+)\(/;
    let match = line.match(regex);
    let global ="";

    if (match) {
        global = match[1];
    } 

    return global;
}

 function getFileName(fileName:string, global:string) : string {
    const extIndex = fileName.lastIndexOf('.');
    const baseName = fileName.substring(0, extIndex);
           // const extension = fileName.substring(extIndex + 1);

    return `${baseName}_${global}.csv`;
}
