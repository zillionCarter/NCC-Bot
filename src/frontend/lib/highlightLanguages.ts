import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';

/**
 * The languages a school actually writes code in.
 *
 * rehype-highlight's default registers every grammar highlight.js ships, which is
 * around a megabyte of parsers for languages that will never appear here. Naming the
 * set explicitly keeps the initial bundle honest.
 */
export const HIGHLIGHT_LANGUAGES = {
  bash,
  c,
  cpp,
  csharp,
  css,
  html: xml,
  java,
  javascript,
  json,
  python,
  sql,
  typescript,
  xml,
};
