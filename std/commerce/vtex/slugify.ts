/* eslint-disable no-useless-escape */
/**
 * VTEX catalog slugify function
 *
 * Copied from:
 * https://github.com/vtex/rewriter/blob/1ce2010783e0586cab42534ce2fb7a983d8a3a84/node/clients/catalog.ts#L72
 *
 * Sometimes, we need to slugify strings for creating urls. An example is the
 * brand urls, where we create them from the brand's name.
 * This slugify function should match exactly what VTEX catalog generates. Any mismatch
 * will lead to broken links.
 * Hopefully, we had this function implemented on VTEX IO and we've been using it for
 * years now. However, looking at the code, I think we can save lots of computing. I'm
 * in a hurry for doing these tests now, so I'll leave a small TODO.
 *
 * TODO: Research for better ways of computing this slugify function. Things I'd try are:
 * - Join those 3 regexs for special characters into a single one.
 * - Replace the regexp of `removeDiacritics` function with a Map. We can make the complexity
 * of this function be O(n) with n=string.length
 *
 */
 const from =
 'ÁÄÂÀÃÅČÇĆĎÉĚËÈÊẼĔȆÍÌÎÏŇÑÓÖÒÔÕØŘŔŠŤÚŮÜÙÛÝŸŽáäâàãåčçćďéěëèêẽĕȇíìîïňñóöòôõøðřŕšťúůüùûýÿžþÞĐđßÆa'

const to =
 'AAAAAACCCDEEEEEEEEIIIINNOOOOOORRSTUUUUUYYZaaaaaacccdeeeeeeeeiiiinnooooooorrstuuuuuyyzbBDdBAa'

const removeDiacritics = (str: string) => {
 let newStr = str.slice(0)

 for (let i = 0; i < from.length; i++) {
   newStr = newStr.replace(new RegExp(from.charAt(i), 'g'), to.charAt(i))
 }

 return newStr
}

const slugifySpecialCharacters = (str: string) => {
 return str.replace(/[·/_,:]/, '-')
}

export function slugify(str: string) {
 const noCommas = str.replace(/,/g, '')
 const replaced = noCommas.replace(/[*+~.()'"!:@&\[\]`/ %$#?{}|><=_^]/g, '-')
 const slugified = slugifySpecialCharacters(removeDiacritics(replaced))

 return slugified.toLowerCase()
}