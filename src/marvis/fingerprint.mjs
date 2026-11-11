// 设备指纹 —— uskey / qimei36 的来源
//
// 这两个值都是 Marvis 客户端在本地生成的设备标识，随每个请求放进
// `Ual-Access-MarvisExt` 头里。本模块负责给出符合上游格式的值。
//
// 实现分两条路：
//   1. 装了 Marvis 客户端并保留 `native/` 目录时 —— 用客户端自带的 Beacon SDK 现签；
//   2. 否则 —— 按上游要求的格式本地生成。
//
// `native/` 目录是可选的：存在且能加载时优先使用，否则按同样的格式在本地生成。
// 那 4 个文件是与平台相关的二进制，不随本仓库分发。
//
// ⚠ `qimei36` 取不到真值时返回空串，由调用方整个不发该字段 ——
//   这个字段上游要求与设备一致，不适合用占位值冒充。

import { randomBytes } from "node:crypto"
import { createRequire } from "node:module"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)

const HERE = dirname(fileURLToPath(import.meta.url))
/** 插件根目录下的 native/ —— 可选 */
export const NATIVE_DIR = join(HERE, "..", "..", "native")

/** 四个文件一起才工作（beacon_napi.node 靠同目录兄弟 DLL 动态加载） */
const REQUIRED = ["beacon_napi.node", "qimei.dll", "beacon_sdk.dll", "beacon_wrapper.dll"]

/** 上游 appKey —— 来自 Marvis 的 resources/.env 的 MARVIS_QIMEI_APPKEY */
const APP_KEY = "0WIN06Y06DKV1IUQ"
const APP_VERSION = "1.60.3300.408"

/** uskey 的字节长度 */
export const USKEY_BYTES = 376

/** @type {{ getUskey: Function, getQimei: Function } | null} */
let beacon = null
let beaconTried = false

/**
 * 尝试加载**可选**的 Beacon SDK。失败不抛、不阻塞 —— 返回 null 即走本地生成。
 * @returns {{ getUskey: Function, getQimei: Function } | null}
 */
function tryBeacon() {
  if (beaconTried) return beacon
  beaconTried = true
  try {
    if (!REQUIRED.every((f) => existsSync(join(NATIVE_DIR, f)))) return null
    const mod = require(join(NATIVE_DIR, "beacon_napi.node"))
    if (mod.init({ appKey: APP_KEY, appVersion: APP_VERSION }) !== 0) return null
    beacon = mod
    return mod
  } catch {
    return null
  }
}

/**
 * 一个 uskey。
 *
 * 有 native/ 且能加载 → 用 SDK 签；否则本地生成一个同长度同格式的值。
 *
 * @param {string} [businessId] 业务 id，模型网关固定 `marvis_client`
 * @returns {string}
 */
export function uskeyOf(businessId = "marvis_client") {
  const b = tryBeacon()
  if (b) {
    try {
      const real = String(b.getUskey(businessId, { reqScene: 1, taskType: "user" }) ?? "")
      if (real && real !== "null") return real
    } catch {
      /* 拿不到就落到本地生成，不阻塞请求 */
    }
  }
  return localUskey()
}

/**
 * 本地生成 uskey：与上游格式一致的 base64 串。
 * @returns {string}
 */
export function localUskey() {
  return randomBytes(USKEY_BYTES).toString("base64")
}

/**
 * `localUskey()` 的别名，保留旧名字方便迁移。
 * @returns {string}
 */
export function syntheticUskey() {
  return localUskey()
}

/**
 * 设备 qimei36 —— **取不到真值就返回空串**。
 * 调用方据此决定要不要把该字段放进请求。
 * @returns {string} 真值或空串
 */
export function qimei36() {
  const b = tryBeacon()
  if (!b) return ""
  try {
    return String(b.getQimei() ?? "")
  } catch {
    return ""
  }
}

/** 当前是否在用 SDK 签指纹（诊断用） */
export function usingNativeFingerprint() {
  return tryBeacon() !== null
}

/** 给用户看的说明 */
export function fingerprintHint() {
  return usingNativeFingerprint()
    ? "使用 native/ 里的 Beacon SDK 现签设备指纹"
    : "本地生成设备指纹（无需 native/ 目录）"
}
