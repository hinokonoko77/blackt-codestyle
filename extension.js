const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { exec } = require('child_process');
const execPromise = promisify(exec);
const formatFile = require('./formatter'); // Import the formatFile function

// This method is called when your extension is activated
function activate(context) {
    console.log('Your extension "blackt-codestyle" is now active!');

    // Register the command to apply code style from terminal
    const disposableTerminal = vscode.commands.registerCommand('codestyle', function () {
        const editor = vscode.window.activeTextEditor;

        if (editor && editor.document) {
            const filePath = editor.document.uri.fsPath;
            if (fs.existsSync(filePath)) {
                formatAndMonitorCode(filePath); // Format and monitor the code
            } else {
                vscode.window.showErrorMessage(`File not found: ${filePath}`);
            }
        } else {
            vscode.window.showErrorMessage('No active editor or document found.');
        }
    });

    // Register the command to apply code style via the command palette
    const disposablePanel = vscode.commands.registerCommand('blackt-codestyle.applyCodeStyle', function () {
        const editor = vscode.window.activeTextEditor;

        if (editor && editor.document) {
            const filePath = editor.document.uri.fsPath;
            formatAndMonitorCode(filePath); // Format and monitor the code
        } else {
            vscode.window.showErrorMessage('No active editor or document found.');
        }
    });

    context.subscriptions.push(disposableTerminal, disposablePanel);
}

// Declare variables for event listeners outside of the function to ensure cleanup
let preventEditsDisposable = null;
let monitorChangesDisposable = null;

// Function to format and monitor the code
async function formatAndMonitorCode(filePath) {
    try {
        console.log('Processing file:', filePath);

        // Remove previous event listeners if they exist
        if (preventEditsDisposable) {
            preventEditsDisposable.dispose();
        }
        if (monitorChangesDisposable) {
            monitorChangesDisposable.dispose();
        }

        const formattedContent = await formatFile(filePath);

        if (!formattedContent) {
            throw new Error('Formatted content is empty or undefined.');
        }

        // Get the original document's content
        const originalDocument = vscode.window.activeTextEditor?.document;
        if (!originalDocument) {
            vscode.window.showErrorMessage('No active document found.');
            return;
        }

        const originalContent = originalDocument.getText();

        // Check if the formatted content matches the original content
        if (formattedContent === originalContent) {
            vscode.window.showInformationMessage('Your code looks good! :)');
            return;
        }

        // Get the file extension of the original file
        const fileExtension = path.extname(filePath).toLowerCase();

        // Define the temporary file path for the codestyle file
        const codestyleFilePath = path.join(__dirname, `codestyle${fileExtension}`);

        // Write the formatted content to the codestyle file
        fs.writeFileSync(codestyleFilePath, formattedContent);

        // Open the diff editor
        const leftUri = vscode.Uri.file(filePath);
        const rightUri = vscode.Uri.file(codestyleFilePath);

        const diffTitle = `Codestyle Comparison: ${path.basename(filePath)}`;
        await vscode.commands.executeCommand(
            'vscode.diff',
            leftUri,
            rightUri,
            diffTitle
        );

        // Block edits programmatically on the codestyle file
        preventEditsDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
            if (event.document.uri.fsPath === codestyleFilePath) {
                const codestyleDocument = event.document;
                vscode.window.visibleTextEditors.forEach((editor) => {
                    if (editor.document.uri.fsPath === codestyleFilePath) {
                        editor.edit((editBuilder) => {
                            editBuilder.replace(
                                new vscode.Range(0, 0, codestyleDocument.lineCount, 0),
                                formattedContent
                            );
                        });
                    }
                });
            }
        });

        // Monitor for changes to the original file and auto-close if content matches
        monitorChangesDisposable = vscode.workspace.onDidChangeTextDocument(async (event) => {
            const currentDocument = vscode.window.activeTextEditor?.document;

            if (currentDocument && currentDocument.uri.fsPath === filePath) {
                const currentContent = currentDocument.getText();
                if (currentContent === formattedContent) {
                    vscode.window.showInformationMessage('Your code looks good! :)');
                    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                    preventEditsDisposable.dispose(); // Stop blocking edits
                    monitorChangesDisposable.dispose(); // Stop monitoring
                }
            }
        });

        // Cleanup codestyle file when the editor closes
        vscode.workspace.onDidCloseTextDocument((document) => {
            if (document.uri.fsPath === codestyleFilePath) {
                try {
                    fs.unlinkSync(codestyleFilePath);
                    console.log(`Successfully deleted codestyle file: ${codestyleFilePath}`);
                } catch (err) {
                    console.error(`Failed to delete the codestyle file: ${err}`);
                }
            }
        });
    } catch (err) {
        console.error('Error processing file:', err);
        vscode.window.showErrorMessage(`Error processing file: ${err.message}`);
    }
}

// Example of how you might run an external command with execPromise
async function runCommand(command) {
    try {
        const { stdout, stderr } = await execPromise(command);
        if (stderr) {
            console.error(`Error executing command: ${stderr}`);
        }
        console.log(`Command output: ${stdout}`);
        return stdout;
    } catch (error) {
        console.error(`Error executing command: ${error}`);
    }
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
    activate,
    deactivate
};
