# OGG Vorbis変換ライブラリ

wasm-media-encoders 0.7.0のUMD版JavaScriptとOGG用WebAssemblyを、変更せず同梱しています。MP3用WebAssemblyは同梱していません。

- 配布元：[arseneyr/wasm-media-encoders](https://github.com/arseneyr/wasm-media-encoders)
- 配布元のソース識別子：`4a45333baadbab312d1cc0911151dfad23157c51`。libogg：`bada45718453ac27b56773ae663f7e65112f6a6e`、libvorbis：`0657aee69dec8508a0011f47f3b69d7538e9d262`。
- npm配布物：[wasm-media-encoders-0.7.0.tgz](https://registry.npmjs.org/wasm-media-encoders/-/wasm-media-encoders-0.7.0.tgz)
- npm配布物のSHA-512：`Sp4wUasgxOK/IFfNhpon6LQQgYGwtpxyV4isjGIe1rvhnJL3w2KYr4f+CdqDNtGPDcgCDRY+uBanVfSx6Si0WQ==`
- `dist/umd/WasmMediaEncoder.min.js` を `wasm-media-encoder-0.7.0.js` として同梱。SHA-256：`dd4e17abf5377dfecc726d6ec5e7b72dab01cf3522974278e5347f4e68480fb3`
- `wasm/ogg.wasm` を `ogg-vorbis-0.7.0.wasm` として同梱。SHA-256：`cd1f50349e58e650e33e3f0b850a785ed612c4abaa4756e520e50b2583cf07ed`

ラッパーと変換処理はMIT（Copyright © 2020-2024 arseneyr）。原文は [LICENSE-wasm-media-encoders.txt](./LICENSE-wasm-media-encoders.txt) にあります。WebAssemblyに含まれるliboggとlibvorbisはBSDで、[liboggの本文](./LICENSE-libogg.txt)と[libvorbisの本文](./LICENSE-libvorbis.txt)を同梱しています。SWC・Emscripten・musl由来の補助コードの条件は [LICENSE-vorbis-runtime.txt](./LICENSE-vorbis-runtime.txt) に記載しています。

これらの第三者のコードには、本プロジェクトの音源・サンプル楽譜のCC0指定を適用しません。
