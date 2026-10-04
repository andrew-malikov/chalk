import type { AppRPCClient } from "./rpc";

export function mountExternalLinks(
  container: HTMLElement,
  open: AppRPCClient["request"]["openExternal"],
  fail: (cause: unknown) => void,
) {
  const click = (event: MouseEvent) => {
    if (event.defaultPrevented || !(event.target instanceof Element)) return;
    const anchor = event.target.closest<HTMLAnchorElement>("a[href]");

    if (!anchor || anchor.getAttribute("href")?.startsWith("#")) return;

    if (!URL.canParse(anchor.href)) return;
    const url = new URL(anchor.href);

    if (!["http:", "https:", "mailto:"].includes(url.protocol)) return;
    event.preventDefault();
    void open({ url: url.href }).catch(fail);
  };

  container.addEventListener("click", click);

  return () => container.removeEventListener("click", click);
}
