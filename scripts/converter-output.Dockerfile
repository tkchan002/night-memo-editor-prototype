# Appended after pinned CryptPad Dockerfile. Export only the browser converter.
FROM scratch AS eurooffice-converter-export
COPY --from=build /core/build/bin/linux_64/x2t.js /x2t.js
COPY --from=build /core/build/bin/linux_64/x2t.wasm /x2t.wasm
