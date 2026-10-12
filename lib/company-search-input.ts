const SEARCH_INPUT_ERROR = "회사명 또는 공개된 사업자등록번호를 2~100자로 입력하세요. 번호는 공백·하이픈을 제외하고 2자리 이상이어야 합니다. 와일드카드와 제어문자는 사용할 수 없습니다.";

export function validateCompanySearch(value: string | string[] | undefined, allowEmpty = false) {
  if (Array.isArray(value)) return { query: "", error: "검색어는 한 번만 지정할 수 있습니다." };
  const raw = value ?? "";
  const query = raw.trim();
  const length = [...query].length;
  const registration = /^[\d\s-]+$/.test(query) ? query.replace(/\D/g, "") : "";
  const forbidden = /[%_\x00-\x1f\x7f]/.test(raw);
  if (allowEmpty && !query && !forbidden) return { query: "", error: null };
  if (length < 2 || length > 100 || forbidden || !/[\p{L}\p{N}]/u.test(query)
    || (registration && registration.length < 2)) {
    // Do not echo unbounded input or control characters into the rendered form.
    return { query: [...query.replace(/[\x00-\x1f\x7f]/g, "")].slice(0, 100).join(""), error: SEARCH_INPUT_ERROR };
  }
  return { query, error: null };
}
