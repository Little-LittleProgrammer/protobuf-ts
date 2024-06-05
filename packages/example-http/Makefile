API_PROTO_FILES=$(shell find protos -name *.proto)

default: npm-build generate

npm-build:
	npm run build

generate:
	# 只生成ts的message
	npx protoc --proto_path=./protos \
	       --proto_path=./third_party \
		   --ts_out=. \
		   --ts_opt=only_http \
	    	$(API_PROTO_FILES)
	node ./bin/index.js


