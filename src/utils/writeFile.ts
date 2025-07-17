import { Uri, workspace } from "vscode";
import { parseWinPath } from "./parseWinPath";
import { TextEncoder } from "util";

export const writeFile = async (
  filePath: Uri,
  content: string | Uint8Array
) => {
  const parsedPath = parseWinPath(filePath.fsPath);
  filePath = Uri.file(parsedPath);

  let data: Uint8Array;
  if (typeof content === "string") {
    data = new TextEncoder().encode(content);
  } else {
    data = content;
  }

  await workspace.fs.writeFile(filePath, data);
};
