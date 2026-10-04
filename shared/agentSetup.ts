import { AGENT_WRITING_POLICY } from './agentWriting';
import { AGENT_ETHOS } from './agentEthos';
import { AGENT_DISCOVERY_POLICY } from './agentDiscovery';

export function agentSetup(origin: string, token?: string) {
  const site = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname) ? 'https://dev.druggie.org' : new URL(origin).origin;
  const profile = site === 'https://dev.druggie.org' ? ' --profile dev' : '';
  return { site, profile, prompt: `Install and connect the New Drugs CLI for me. Use the CLI directly; MCP setup is unnecessary.

Site: ${site}
Access token: ${token || '[Create a token above, then copy this prompt]'}

1. Check that Node.js 22 or newer and npm are available. Install the CLI from ${site}/downloads/newdrugs-cli.tgz using npm. Use a user-owned installation prefix if needed; do not use sudo without asking me.
2. Run newdrugs${profile} login --url ${site} --token-stdin, passing the access token through stdin. Keep it out of command arguments, logs and your replies. The CLI stores it privately.
3. Run newdrugs${profile} native-install. It downloads and verifies the native executable for supported macOS, Linux and Windows systems, then prints its managed launcher path. Use that path for later commands when available; the installed Node CLI remains the fallback on other systems.
4. Verify the connection with the selected CLI using read identity.get and read wallet.get. These are read-only and cost no New Drugs credit.
5. Use the selected CLI's search and describe commands to discover the actual operations. Read each operation's schema before calling it. Ask for confirmation before actions that require it, then execute each individual action with its own idempotency key. Profile text and photos are human-authored in the app.

The installed CLI checks for newer published versions daily and updates itself; run newdrugs update to check immediately. If I ask to remove it, run newdrugs uninstall --yes to remove the CLI, standard New Drugs MCP registrations, and all locally saved logins.

When helping me use New Drugs after setup:
${AGENT_ETHOS}
${AGENT_WRITING_POLICY}
${AGENT_DISCOVERY_POLICY}

Tell me when setup is complete. Do not post or send messages during setup.` };
}

/** Optional remote-computer setup. Keep the existing PAT prompt as the default. */
export function agentDeviceSetup(origin:string){
 const {site,profile}=agentSetup(origin);
 return `Install and connect the New Drugs CLI for me using browser approval. Use Node.js 22 or newer and install from ${site}/downloads/newdrugs-cli.tgz. Use a user-owned prefix if needed.

Run newdrugs${profile} login --device --url ${site}. Give me the approval link and code it prints so I can approve it in my browser or on my phone. Keep the command running while it polls. The CLI verifies identity and saves credentials privately on your computer. It does not need a localhost callback. Keep credentials out of chat, command arguments and logs.

After approval, run newdrugs${profile} native-install and use its returned managed launcher path when available; the Node CLI remains the fallback. Verify with read identity.get. Setup is free from New Drugs' side. Keep the saved profile and discover operations using search and describe. Do not post or send messages during setup.

${AGENT_ETHOS}
${AGENT_WRITING_POLICY}
${AGENT_DISCOVERY_POLICY}`;
}
