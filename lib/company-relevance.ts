// Strip legal forms only at the edges; preserve words inside the actual company name.
export function companyRelevanceKey(name: string) {
  let key = name.replaceAll("（", "(").replaceAll("）", ")").replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
  const edge = /^(?:주식회사|유한책임회사|유한회사|합자회사|합명회사|사단법인|재단법인|\(주\)|\(유\)|㈜)|(?:주식회사|유한책임회사|유한회사|합자회사|합명회사|사단법인|재단법인|\(주\)|\(유\)|㈜)$/g;
  for (;;) {
    const stripped = key.replace(edge, "");
    if (!stripped || stripped === key) return key;
    key = stripped;
  }
}
