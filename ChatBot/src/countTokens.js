const { Tokenizer } = require('tiktoken');

function countTokens(text) {
  const tokenizer = new Tokenizer();
  tokenizer.add_text(text);
  const tokenCount = tokenizer.count_tokens();
  return tokenCount;
}

module.exports = countTokens;
