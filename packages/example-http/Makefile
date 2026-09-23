.PHONY: default npm-build generate clean-dist collision-check

API_PROTO_FILES=$(shell find protos -name '*.proto')
GENERATED_DIR=generated

default: npm-build

npm-build:
	npm run build

generate:
	@node -e "const fs = require('fs'); fs.rmSync('$(GENERATED_DIR)', {recursive: true, force: true}); fs.mkdirSync('$(GENERATED_DIR)');"
	npx protoc --proto_path=./protos \
	       --proto_path=./third_party \
		   --ts_out=$(GENERATED_DIR) \
		   --ts_opt=only_http \
		   --ts_opt=long_type_number \
		   --ts_opt=use_proto_field_name \
	    	$(API_PROTO_FILES)

clean-dist:
	@node -e "require('fs').rmSync('dist', {recursive: true, force: true})"

collision-check:
	@$(MAKE) -C ../plugin build
	@$(MAKE) npm-build
	node ./bin/check-collisions.js
