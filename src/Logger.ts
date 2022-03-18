import { OutputChannel, window } from 'vscode';

export class Logger {
  private channel: OutputChannel | null = null; 

  constructor(title: string) {
    this.channel = window.createOutputChannel(title);
  }

  public info(message: string, type: "INFO" | "WARNING" | "ERROR" = "INFO"): void {
    this.channel?.appendLine(`["${type}" - ${new Date().toISOString()}]  ${message}`);
  }

  public warning(message: string): void {
    this.info(message, "WARNING");
  }

  public error(message: string): void {
    this.info(message, "ERROR");
  }
}