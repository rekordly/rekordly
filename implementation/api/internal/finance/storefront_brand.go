package finance

import (
	"errors"
	"strings"
)

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
		if font != "" && font != "modern" && font != "classic" && font != "friendly" {
			return errors.New("choose a valid brand font")
		}
	}
	return nil
}
