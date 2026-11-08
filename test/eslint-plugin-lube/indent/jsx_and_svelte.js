import svelte_parser from "svelte-eslint-parser"
/** @type {import("eslint").Linter.LanguageOptions} */
const jsx = {
	parserOptions: { ecmaFeatures: { jsx: true } }
}
/** @type {import("eslint").Linter.LanguageOptions} */
const svelte = { parser: svelte_parser }
/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 * @returns {void}
 */
export function cases(valid, invalid) {
	valid.push(
		{
			code: "const a = (\n\t<div\n\t\tb=\"c\"\n\t>\n\t\ttext\n\t\t<span>{d}</span>\n\t</div>\n)",
			languageOptions: jsx
		},
		{
			code: "const a = <div>\r\n\t<b />\r\n</div>",
			languageOptions: jsx
		},
		{
			code: "<script>\n\tconst a = {\n\t\tb: 1\n\t}\n</script>\n<div>\n    {a.b}\n</div>",
			filename: "a.svelte",
			languageOptions: svelte
		},
		{
			code: "<script>\nconst a = {\n\tb: 1\n}\n</script>",
			filename: "a.svelte",
			languageOptions: svelte
		},
		{
			code: "<script>\n\tlet a\n\t$: b = a\n</script>",
			filename: "a.svelte",
			languageOptions: svelte
		},
		{
			code: "<div>\n\t{#if a\n\t\t&& b}\n\t\t<p />\n\t{/if}\n</div>",
			filename: "a.svelte",
			languageOptions: svelte
		}
	)
	invalid.push(
		{
			code: "const a = <div>\n<b />\n</div>",
			errors: [
				{
					line: 2,
					messageId: "wrongIndentation"
				}
			],
			languageOptions: jsx,
			output: "const a = <div>\n\t<b />\n</div>"
		},
		{
			code: "const a = <div>\r<b>\r<c />\r\t\t</b>\r</div>",
			errors: [
				{
					line: 2,
					messageId: "wrongIndentation"
				},
				{
					line: 3,
					messageId: "wrongIndentation"
				},
				{
					line: 4,
					messageId: "wrongIndentation"
				}
			],
			languageOptions: jsx,
			output: "const a = <div>\r\t<b>\r\t\t<c />\r\t</b>\r</div>"
		},
		{
			code: "<script>\n\tconst a = {\n\tb: 1\n\t}\n\tf()\n</script>",
			errors: [
				{
					line: 3,
					messageId: "wrongIndentation"
				}
			],
			filename: "a.svelte",
			languageOptions: svelte,
			output: "<script>\n\tconst a = {\n\t\tb: 1\n\t}\n\tf()\n</script>"
		},
		{
			code: "<script>\n\tconst a = 1\n  f()\n</script>",
			errors: [
				{
					line: 3,
					messageId: "wrongIndentation"
				}
			],
			filename: "a.svelte",
			languageOptions: svelte,
			output: "<script>\n\tconst a = 1\n\tf()\n</script>"
		},
		{
			code: "<div>\n\t{a.map(b => {\n\treturn b\n\t})}\n</div>",
			errors: [
				{
					line: 3,
					messageId: "wrongIndentation"
				}
			],
			filename: "a.svelte",
			languageOptions: svelte,
			output: "<div>\n\t{a.map(b => {\n\t\treturn b\n\t})}\n</div>"
		},
		{
			code: "{#if a\n&& b}\n\t<p />\n{/if}",
			errors: [
				{
					line: 2,
					messageId: "wrongIndentation"
				}
			],
			filename: "a.svelte",
			languageOptions: svelte,
			output: "{#if a\n\t&& b}\n\t<p />\n{/if}"
		},
		{
			code: "<button on:click={() => {\nf()\n}}>a</button>",
			errors: [
				{
					line: 2,
					messageId: "wrongIndentation"
				}
			],
			filename: "a.svelte",
			languageOptions: svelte,
			output: "<button on:click={() => {\n\tf()\n}}>a</button>"
		},
		{
			code: "<div>\n\t<p>\n\t\t{f(\n\t\ta\n\t\t)}\n\t</p>\n</div>",
			errors: [
				{
					line: 4,
					messageId: "wrongIndentation"
				}
			],
			filename: "a.svelte",
			languageOptions: svelte,
			output: "<div>\n\t<p>\n\t\t{f(\n\t\t\ta\n\t\t)}\n\t</p>\n</div>"
		},
		{
			code: "{#snippet a(\n\t\tb,\n\t\tc\n)}\n\t<p />\n{/snippet}",
			errors: [
				{
					line: 2,
					messageId: "wrongIndentation"
				},
				{
					line: 3,
					messageId: "wrongIndentation"
				}
			],
			filename: "a.svelte",
			languageOptions: svelte,
			output: "{#snippet a(\n\tb,\n\tc\n)}\n\t<p />\n{/snippet}"
		}
	)
}