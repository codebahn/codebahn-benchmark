# Task

You have access to MCP tools for interacting with a Git hosting platform.
The repository is {owner}/{repo}.

Review the open pull request titled "feat: add pricing client".

Judge it the way you would judge a change about to land on main: correctness,
error handling, security, and whether this is a history you would want to
bisect through later.

End your reply with a fenced json block and nothing after it:

```json
{"findings": [{"file": "src/example.ts", "issue": "what is wrong, in one line"}]}
```

One entry per problem you are confident about. An empty list is a valid answer.
