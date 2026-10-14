# Read a string field from metadata.json.
meta = $(shell sed -n 's/.*"$(1)"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' metadata.json)

UUID    := $(call meta,uuid)
DOMAIN  := $(call meta,gettext-domain)
VERSION := $(call meta,version-name)
SOURCES := extension.js
POT     := po/$(DOMAIN).pot
# Real .po files vs. symlinked aliases (e.g. zh_TW.po -> zh_Hant.po).
POS     := $(shell find po -maxdepth 1 -name '*.po' -type f 2>/dev/null | sort)
POLINKS := $(shell find po -maxdepth 1 -name '*.po' -type l 2>/dev/null | sort)
LANGS   := $(basename $(notdir $(POS)))
MOS     := $(foreach l,$(LANGS),locale/$(l)/LC_MESSAGES/$(DOMAIN).mo)
PACKED  := dist/$(UUID).shell-extension.zip
ZIP     := dist/$(UUID).shell-extension-v$(VERSION).zip

.PHONY: all pot po linguas mo zip clean

all: zip

# 1. Extract translatable strings from the source into the .pot template.
pot: $(POT)
$(POT): $(SOURCES)
	@mkdir -p po
	xgettext --from-code=UTF-8 --language=JavaScript \
		--keyword=_ --keyword=gettext:2 \
		--package-name=$(UUID) \
		--add-comments=TRANSLATORS \
		-o $@ $(SOURCES)

# 2. Sync every .po file with the .pot (new/changed strings are merged in).
#    Symlinked aliases are skipped (they share the file they point to), and
#    po/LINGUAS is regenerated from the .po files (including aliases).
po: $(POT) linguas
	@for f in $(POS); do \
		echo "msgmerge $$f"; \
		msgmerge --update --backup=none --quiet $$f $(POT) || exit 1; \
	done

linguas:
	@printf '%s\n' "$(sort $(basename $(notdir $(POS) $(POLINKS))))" > po/LINGUAS.new
	@if cmp -s po/LINGUAS po/LINGUAS.new; then rm po/LINGUAS.new; \
		else mv po/LINGUAS.new po/LINGUAS; echo "updated po/LINGUAS"; fi

# 3. Compile each .po into locale/<lang>/LC_MESSAGES/<domain>.mo, and mirror
#    symlinked .po files as symlinked locale directories
#    (po/zh_TW.po -> zh_Hant.po  =>  locale/zh_TW -> zh_Hant).
mo: $(MOS)
	@for l in $(POLINKS); do \
		alias=$$(basename $$l .po); \
		target=$$(basename $$(readlink $$l) .po); \
		echo "link locale/$$alias -> $$target"; \
		ln -sfn $$target locale/$$alias || exit 1; \
	done

locale/%/LC_MESSAGES/$(DOMAIN).mo: po/%.po
	@mkdir -p $(dir $@)
	msgfmt --check --output-file=$@ $<

# 4. Build the release package (compiled translations are included).
zip: mo
	@mkdir -p dist
	gnome-extensions pack --force --out-dir=dist --extra-source=locale $(CURDIR)
	mv -f $(PACKED) $(ZIP)
	@echo "Created $(ZIP)"

clean:
	rm -rf dist
