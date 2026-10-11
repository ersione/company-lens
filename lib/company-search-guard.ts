export const maxSearchCandidates = 20000;

export class SearchTooBroadError extends Error {
  constructor() {
    super("검색 범위가 너무 넓습니다. 회사명이나 공개 번호를 더 구체적으로 입력하세요.");
    this.name = "SearchTooBroadError";
  }
}
