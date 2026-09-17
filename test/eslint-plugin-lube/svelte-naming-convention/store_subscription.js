import svelte_parser from "svelte-eslint-parser"
const language_options = { parser: svelte_parser }
/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 */
export function cases(valid, invalid) {
	valid.push(
		{
			code: "<script>\n\tconst snake_case = writable(1)\n\tconst v = $snake_case\n</script>\n<div>{$snake_case}</div>",
			filename: "a.svelte",
			languageOptions: language_options
		},
		{
			code: "<script>\n\timport { myStore } from \"./stores.js\"\n\tconst v = $myStore\n</script>",
			filename: "a.svelte",
			languageOptions: language_options
		}
	)
	invalid.push(
		{
			code: "<script>\n\tconst myStore = writable(1)\n\tconst v = $myStore\n</script>\n<div>{$myStore}</div>",
			errors: [ { messageId: "rename" } ],
			filename: "a.svelte",
			languageOptions: language_options,
			output: "<script>\n\tconst my_store = writable(1)\n\tconst v = $my_store\n</script>\n<div>{$my_store}</div>"
		},
		{
			code: "var myStore = 1\nvar v = $myStore",
			errors: [ { messageId: "rename" } ],
			output: null
		}
	)
}