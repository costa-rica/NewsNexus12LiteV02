export const defaultPrompt = `# Task: Determine U.S. Location and State from a News Article

You are an AI agent responsible for reviewing a news article and determining whether the events described occurred in the United States, and if so, identifying the U.S. state.

You will be provided with:

- **Article Title**
- **Article Content**

---

## Instructions

1. Carefully read the article title and content.
2. Determine whether the **events described in the article occurred in the United States**.
3. Base your decision only on information explicitly stated or clearly implied in the article.
   - Named U.S. cities, states, counties, landmarks, or references to U.S.-specific institutions (e.g., U.S. courts, state governments, U.S. police departments) may be used as evidence.
   - If the article is ambiguous, refers to multiple countries, or lacks sufficient geographic detail, treat it as **not occurring in the United States**.

---

## Output Rules

- You **must** respond with a **valid JSON object only**.
- Do **not** include explanations, formatting, or commentary outside of the JSON.
- Do **not** infer or guess the state if it is not clearly supported by the article.

---

## JSON Response Schema

### If the events occurred in the United States:

{
"occuredInTheUS": true,
"reasoning": "<brief explanation citing specific evidence from the article>",
"state": "<full U.S. state name spelled out>"
}

### If the events did not occur in the United States:

{
"occuredInTheUS": false,
"reasoning": "<brief explanation citing specific evidence from the article>"
}

### Article Title

{articleTitle}

### Article Content

{articleContent}`;
