import pc from 'picocolors';

export const logger = {
  info(message: string): void {
    console.log(`${pc.cyan('ℹ')} ${message}`);
  },
  success(message: string): void {
    console.log(`${pc.green('✔')} ${pc.bold(message)}`);
  },
  warn(message: string): void {
    console.log(`${pc.yellow('⚠')} ${pc.yellow(message)}`);
  },
  error(message: string): void {
    console.error(`${pc.red('✖')} ${pc.red(pc.bold(message))}`);
  },
  step(num: number | string, total: number | string, message: string): void {
    console.log(`${pc.blue(`[${num}/${total}]`)} ${message}`);
  },
  heading(message: string): void {
    console.log(`\n${pc.bold(pc.underline(message))}\n`);
  },
  dim(message: string): void {
    console.log(pc.dim(message));
  },
  box(title: string, lines: string[]): void {
    const maxLen = Math.max(title.length, ...lines.map((l) => l.replace(/\u001b\[[0-9;]*m/g, '').length));
    const width = Math.max(maxLen + 4, 40);
    const border = pc.cyan('─'.repeat(width));
    const top = `${pc.cyan('╭')}${border}${pc.cyan('╮')}`;
    const bottom = `${pc.cyan('╰')}${border}${pc.cyan('╯')}`;

    console.log(`\n${top}`);
    console.log(`${pc.cyan('│')} ${pc.bold(pc.cyan(title.padEnd(width - 2)))} ${pc.cyan('│')}`);
    console.log(`${pc.cyan('├')}${border}${pc.cyan('┤')}`);
    for (const line of lines) {
      const rawLen = line.replace(/\u001b\[[0-9;]*m/g, '').length;
      const pad = ' '.repeat(Math.max(0, width - 2 - rawLen));
      console.log(`${pc.cyan('│')} ${line}${pad} ${pc.cyan('│')}`);
    }
    console.log(`${bottom}\n`);
  },
};
