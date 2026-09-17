const wide_regex = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uA960-\uA97F\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/g
/**
 * @param {string} text
 * @returns {number}
 */
function text_width(text) {
	return text.length + (text.match(wide_regex)?.length ?? 0)
}
export default text_width