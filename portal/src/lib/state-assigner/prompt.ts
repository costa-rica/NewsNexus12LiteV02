interface PromptArticle {
  title: string;
  content: string;
}

export function buildPrompt(template: string, article: PromptArticle) {
  return template
    .replaceAll("{articleTitle}", article.title)
    .replaceAll("{articleContent}", article.content);
}
