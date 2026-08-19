import { argvWithoutPassthrough, createCli } from '../src/cli.js';

const program = createCli();
// Everything after `--` belongs to Gradle; commander would otherwise consume
// the first token of it as a positional operand.
program.parse(argvWithoutPassthrough(process.argv));
