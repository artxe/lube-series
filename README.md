# Lube Series
Simple tools to lubricate JavaScript.

### **[/async-lube](packages/async-lube/README.md)** · [changelog](packages/async-lube/CHANGELOG.md)
Complex async code as plain functions, `await`, `for await` and `AbortSignal`, without operator chains or a workflow DSL: `http` wraps `fetch` with typed errors, timeouts, retries, token refresh, cancellation, server-sent events and WebSockets, streams are `for await` loops, `flow` runs plain functions that receive the results of their dependencies, with branches, loops, user input and snapshots that resume, and `async-lube/durable` runs an async function that survives crashes and restarts
```bash
npm i async-lube
```

### **[/data-lube](packages/data-lube/README.md)** · [changelog](packages/data-lube/CHANGELOG.md)
Copy, compare, merge, update, diff, patch and freeze nested data with plain JavaScript syntax, at any depth, with circular references, and with the built-in types and class instances, which keep their prototype
```bash
npm i data-lube
```

### **[/datetime-lube](packages/datetime-lube/README.md)** · [changelog](packages/datetime-lube/CHANGELOG.md)
Date math, formatting and parsing for the built-in `Date`, in any time zone, with no wrapper object or time zone plugin and without changing the given date
```bash
npm i datetime-lube
```

### **[/eslint-plugin-lube](packages/eslint-plugin-lube/README.md)** · [changelog](packages/eslint-plugin-lube/CHANGELOG.md)
Fixable formatting and ordering rules, so one `eslint --fix` formats and lints a project without Prettier
```bash
npm i -D eslint-plugin-lube
```

### **[/hangul-lube](packages/hangul-lube/README.md)** · [changelog](packages/hangul-lube/CHANGELOG.md)
Korean search that works while people type: `ㄱㅊㅉㄱ` finds `김치찌개` and `공` finds `고양이`, as a regular expression for a search box, highlighting and a database
```bash
npm i hangul-lube
```