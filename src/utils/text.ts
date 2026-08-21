/** 判断字符是否属于单词内部（字母 / 数字 / 撇号），用于拆句时光标校验 */
export function isWordChar(char: string | undefined): boolean {
  return Boolean(char && /[A-Za-z0-9']/.test(char))
}
