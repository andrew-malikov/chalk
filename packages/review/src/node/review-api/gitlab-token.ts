// Desktop Settings keeps GitLab tokens in the OS keychain, one per MR host.
const service = "Chalk GitLab";

export async function gitLabToken(host: string): Promise<string | undefined> {
  return (await Bun.secrets.get({ service, name: host })) ?? undefined;
}

export async function saveGitLabToken(
  host: string,
  token: string,
): Promise<void> {
  await Bun.secrets.set({ service, name: host, value: token });
}
