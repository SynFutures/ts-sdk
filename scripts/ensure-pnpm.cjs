const execPath = process.env.npm_execpath ?? '';
const userAgent = process.env.npm_config_user_agent ?? '';

const isPnpm = execPath.includes('pnpm') || userAgent.includes('pnpm');
if (!isPnpm) {
    // Keep this message short and explicit because it can be shown in CI logs.
    console.error('This repository uses pnpm. Please run: pnpm install');
    process.exit(1);
}
