package finance

import (
	"errors"
	"strings"
)

// storefrontBrandFonts lists the font keys a store may use for headings and body text.
// Keep in sync with web/src/lib/store-themes/font-styles.ts.
var storefrontBrandFonts = map[string]bool{
	"modern": true, "classic": true, "friendly": true,
	"poppins": true, "dm_sans": true, "manrope": true, "outfit": true, "space_grotesk": true,
	"playfair": true, "lora": true, "cormorant": true, "dm_serif": true,
}

func validateStoreBrand(brand *StorefrontBrand) error {
	if len(brand.Colors) > 3 {
		return errors.New("choose at most three brand colours")
	}
	for i, color := range brand.Colors {
		if !hexColorPattern.MatchString(color) {
			return errors.New("choose a valid brand colour")
		}
		brand.Colors[i] = strings.ToUpper(color)
	}
	for _, font := range []string{brand.HeadingFont, brand.BodyFont} {
		if font != "" && !storefrontBrandFonts[font] {
			return errors.New("choose a valid brand font")
		}
	}
	favicon, err := validateStoreImage(brand.FaviconURL)
	if err != nil {
		return err
	}
	brand.FaviconURL = favicon
	return nil
}
