const slugifySpecialCharacters = (str: string) => {
  return str
    .replace(/[·/_,:]/g, '-')
    .replace(/[*+~.()'"!:@&\[\]`/ %$#?{}|><=_^]/g, '-')
    .replace(
      /Á|Ä|Â|À|Ã|Å|Č|Ç|Ć|Ď|É|Ě|Ë|È|Ê|Ẽ|Ĕ|Ȇ|Í|Ì|Î|Ï|Ň|Ñ|Ó|Ö|Ò|Ô|Õ|Ø|Ř|Ŕ|Š|Ť|Ú|Ů|Ü|Ù|Û|Ý|Ÿ|Ž|á|ä|â|à|ã|å|č|ç|ć|ď|é|ě|ë|è|ê|ẽ|ĕ|ȇ|í|ì|î|ï|ň|ñ|ó|ö|ò|ô|õ|ø|ð|ř|ŕ|š|ť|ú|ů|ü|ù|û|ý|ÿ|ž|þ|Þ|Đ|đ|ß|Æ|a/g,
      "AAAAAACCCDEEEEEEEEIIIINNOOOOOORRSTUUUUUYYZaaaaaacccdeeeeeeeeiiiinnooooooorrstuuuuuyyzbBDdBAa"
    )
    .toLowerCase();
};

export function slugify(str: string) {
  return slugifySpecialCharacters(str.replace(/,/g, ""));
}
