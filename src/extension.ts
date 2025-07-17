import {
  commands,
  ExtensionContext,
  window,
  workspace,
  ProgressLocation,
  Uri,
  extensions,
} from "vscode";
import { Logger } from "./Logger";
import { CronJob } from "cron";
import { writeFile } from "./utils/writeFile";

export function activate(context: ExtensionContext) {
  const logger = new Logger("Extension Installer");
  const { subscriptions } = context;

  subscriptions.push(
    commands.registerCommand("extensionInstaller.backgroundCheck", async () => {
      const apiUrls = workspace
        .getConfiguration(`extensionInstaller`)
        .get<string[]>(`apiUrls`);

      if (!apiUrls || !apiUrls.length) {
        return;
      }

      for (const apiUrl of apiUrls) {
        const response = await fetch(apiUrl);

        if (!response.ok) {
          logger.warning(
            `API Url ${apiUrl} returned a status code of ${response.status}`
          );
          continue;
        }

        const {
          id,
          displayName,
          name,
          version: { major, minor, patch },
        } = (await response.json()) as any;
        const exts = extensions.all;
        const crntExt = exts.find(
          (ext) => ext.id.toLowerCase() === id.toLowerCase()
        );

        const extVersion = crntExt?.packageJSON?.version;
        if (extVersion === `${major}.${minor}.${patch}`) {
          logger.info(`${displayName} is up to date`);
          continue;
        }

        const shouldIgnore = context.globalState.get(
          `${id}-${extVersion}-ignore`
        );
        if (!shouldIgnore) {
          const choice = await window.showInformationMessage(
            `A newer version of the ${
              displayName || id || name
            } extension is available.`,
            `Update`,
            `Ignore`
          );

          if (choice === `Update`) {
            await commands.executeCommand(`extensionInstaller.checkForUpdates`);
          } else if (choice === "Ignore") {
            await context.globalState.update(
              `${id}-${extVersion}-ignore`,
              true
            );
          }
        }
      }
    })
  );

  subscriptions.push(
    commands.registerCommand("extensionInstaller.checkForUpdates", async () => {
      const apiUrls = workspace
        .getConfiguration(`extensionInstaller`)
        .get<string[]>(`apiUrls`);

      if (!apiUrls || !apiUrls.length) {
        window.showWarningMessage(
          `Extension Installer: No API Urls found in the settings.`
        );
        logger.error(`No API Urls found in the settings.`);
        return;
      }

      window.withProgress(
        {
          location: ProgressLocation.Notification,
          cancellable: false,
          title: `Extension Installer: Checking for updates...`,
        },
        async () => {
          logger.info(
            `Checking for updates with the following API Urls: ${apiUrls.join(
              ", "
            )}`
          );

          for (const apiUrl of apiUrls) {
            try {
              let crntFilePath: Uri = Uri.file("");
              const response = await fetch(apiUrl);

              if (!response.ok) {
                logger.warning(
                  `API Url ${apiUrl} returned a status code of ${response.status}`
                );
                continue;
              }

              const data = (await response.json()) as any;

              logger.info(`Installing latest version of ${data.name}`);
              logger.info(`URL ${data.download}`);
              const downloadUrl = data.download;

              const pkgResponse = await fetch(downloadUrl);

              if (pkgResponse.ok) {
                const blob = await pkgResponse.blob();
                const arrayBuffer = await blob.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);

                try {
                  crntFilePath = Uri.joinPath(context.extensionUri, data.name);
                  await writeFile(crntFilePath, uint8Array);
                } catch (err) {
                  logger.warning(
                    `Failed to write in extensionUri, trying workspace folder...`
                  );
                  const folders = workspace.workspaceFolders;
                  if (folders && folders.length > 0) {
                    crntFilePath = Uri.joinPath(folders[0].uri, data.name);
                    await writeFile(crntFilePath, uint8Array);
                  } else {
                    throw new Error(
                      "No workspace folder available to write the file."
                    );
                  }
                }

                await commands.executeCommand(
                  "workbench.extensions.installExtension",
                  crntFilePath
                );

                window
                  .showInformationMessage(
                    `Extension Installer: Great news! ${data.name} got installed.`,
                    "Reload window"
                  )
                  .then(async (result) => {
                    if (result === "Reload window") {
                      await commands.executeCommand(
                        "workbench.action.reloadWindow"
                      );
                    }
                  });
                logger.info(`Great news! ${data.name} got installed.`);
              } else {
                window.showErrorMessage(
                  `Extension Installer: Failed to fetch package - ${data.name}`
                );
                logger.error(
                  `Extension Installer: Failed to fetch package - ${data.name}`
                );
              }

              // Delete file
              if (crntFilePath) {
                workspace.fs.delete(crntFilePath);
              }
            } catch (e) {
              logger.error(
                `Something went wrong during the fetch/installation logic - ${
                  (e as Error).message
                }`
              );
            }
          }
        }
      );
    })
  );

  const job = new CronJob(`0 */1 * * *`, () => {
    logger.info(`Running background check`);
    commands.executeCommand(`extensionInstaller.backgroundCheck`);
  });
  job.start();
}

// this method is called when your extension is deactivated
export function deactivate() {}
