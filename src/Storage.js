export const TYPES_ENUM = {
  bool: 'bool',
  i8: 'i8',
  ui8: 'ui8',
  ui8c: 'ui8c',
  i16: 'i16',
  ui16: 'ui16',
  i32: 'i32',
  ui32: 'ui32',
  f32: 'f32',
  f64: 'f64'
}

export const TYPES_NAMES = {
  bool: 'Uint8',
  i8: 'Int8',
  ui8: 'Uint8',
  ui8c: 'Uint8Clamped',
  i16: 'Int16',
  ui16: 'Uint16',
  i32: 'Int32',
  ui32: 'Uint32',
  f32: 'Float32',
  f64: 'Float64'
}

export const TYPES = {
  bool: 'bool',
  i8: Int8Array,
  ui8: Uint8Array,
  ui8c: Uint8ClampedArray,
  i16: Int16Array,
  ui16: Uint16Array,
  i32: Int32Array,
  ui32: Uint32Array,
  f32: Float32Array,
  f64: Float64Array
}

const UNSIGNED_MAX = {
  uint8: 2**8,
  uint16: 2**16,
  uint32: 2**32
}

const roundToMultiple4 = x => Math.ceil(x / 4) * 4

export const $storeRef = Symbol('storeRef')
export const $storeSize = Symbol('storeSize')
export const $storeMaps = Symbol('storeMaps')
export const $storeFlattened = Symbol('storeFlattened')
export const $storeBase = Symbol('storeBase')

export const $storeArrayCount = Symbol('storeArrayCount')
export const $storeSubarrays = Symbol('storeSubarrays')
export const $storeCursor = Symbol('storeCursor')
export const $subarrayCursors = Symbol('subarrayCursors')
export const $subarray = Symbol('subarray')

export const $queryShadow = Symbol('queryShadow')
export const $serializeShadow = Symbol('serializeShadow')

export const $indexType = Symbol('indexType')
export const $indexBytes = Symbol('indexBytes')

const stores = {}

export const resize = (ta, size) => {
  const newBuffer = new ArrayBuffer(size * ta.BYTES_PER_ELEMENT)
  const newTa = new ta.constructor(newBuffer)
  newTa.set(ta, 0)
  return newTa
}

const resizeRecursive = (store, size) => {
  Object.keys(store).forEach(key => {
    const ta = store[key]
    if (ta[$subarray]) return
    else if (ArrayBuffer.isView(ta)) {
      store[key] = resize(ta, size)
      store[key][$queryShadow] = resize(ta[$queryShadow], size)
      store[key][$serializeShadow] = resize(ta[$serializeShadow], size)
    } else if (typeof ta === 'object') {
      resizeRecursive(store[key], size)
    }
  })
}

const resizeSubarrays = (store, size) => {
  const cursors = store[$subarrayCursors] = {}
  Object.keys(store[$storeSubarrays]).forEach(type => {
    const arrayCount = store[$storeArrayCount]
    const length = store[0].length
    const summedBytesPerElement = Array(arrayCount).fill(0).reduce((a, p) => a + TYPES[type].BYTES_PER_ELEMENT, 0)
    const summedLength = Array(arrayCount).fill(0).reduce((a, p) => a + length, 0)
    const buffer = new ArrayBuffer(roundToMultiple4(summedBytesPerElement * summedLength * size))
    const array = new TYPES[type](buffer)

    array.set(store[$storeSubarrays][type].buffer, 0)

    store[$storeSubarrays][type] = array
    store[$storeSubarrays][type][$queryShadow] = array.slice(0)
    store[$storeSubarrays][type][$serializeShadow] = array.slice(0)

    let end = 0
    for (let eid = 0; eid < size; eid++) {
      const from = cursors[type] + (eid * length)
      const to = from + length
      store[eid] = store[$storeSubarrays][type].subarray(from, to)
      store[eid][$queryShadow] = store[$storeSubarrays][type][$queryShadow].subarray(from, to)
      store[eid][$serializeShadow] = store[$storeSubarrays][type][$serializeShadow].subarray(from, to)
      store[eid][$subarray] = true
      store[eid][$indexType] = array[$indexType]
      store[eid][$indexBytes] = array[$indexBytes]
      end = to
    }
  })
}

export const resizeStore = (store, size) => {
  store[$storeSize] = size
  resizeRecursive(store, size)
  resizeSubarrays(store, size)
}

export const resetStore = store => {
  store[$storeFlattened].forEach(ta => {
    ta.fill(0)
  })
  Object.keys(store[$storeSubarrays]).forEach(key => {
    store[$storeSubarrays][key].fill(0)
  })
}

const createTypeStore = (type, length) => {
  const totalBytes = length * TYPES[type].BYTES_PER_ELEMENT
  const buffer = new ArrayBuffer(totalBytes)
  return new TYPES[type](buffer)
}

const createArrayStore = (store, type, length) => {
  const size = store[$storeSize]
  const cursors = store[$subarrayCursors]
  const indexType =
    length < UNSIGNED_MAX.uint8
      ? 'ui8'
      : length < UNSIGNED_MAX.uint16
        ? 'ui16'
        : 'ui32'

  if (!length) throw new Error('❌ Must define a length for component array.')
  if (!TYPES[type]) throw new Error(`❌ Invalid component array property type ${type}.`)

  // create buffer for type if it does not already exist
  if (!store[$storeSubarrays][type]) {
    const arrayCount = store[$storeArrayCount]
    const summedBytesPerElement = Array(arrayCount).fill(0).reduce((a, p) => a + TYPES[type].BYTES_PER_ELEMENT, 0)
    const summedLength = Array(arrayCount).fill(0).reduce((a, p) => a + length, 0)
    const totalBytes = roundToMultiple4(summedBytesPerElement * summedLength * size)
    
    const buffer = new ArrayBuffer(totalBytes)
    const array = new TYPES[type](buffer)
    store[$storeSubarrays][type] = array
    store[$storeSubarrays][type][$queryShadow] = array.slice(0)
    store[$storeSubarrays][type][$serializeShadow] = array.slice(0)
    
    array[$indexType] = TYPES_NAMES[indexType]
    array[$indexBytes] = TYPES[indexType].BYTES_PER_ELEMENT
  }

  // pre-generate subarrays for each eid
  let end = 0
  for (let eid = 0; eid < size; eid++) {
    const from = cursors[type] + (eid * length)
    const to = from + length
    store[eid] = store[$storeSubarrays][type].subarray(from, to)
    store[eid][$queryShadow] = store[$storeSubarrays][type][$queryShadow].subarray(from, to)
    store[eid][$serializeShadow] = store[$storeSubarrays][type][$serializeShadow].subarray(from, to)
    store[eid][$subarray] = true
    store[eid][$indexType] = TYPES_NAMES[indexType]
    store[eid][$indexBytes] = TYPES[indexType].BYTES_PER_ELEMENT
    end = to
  }

  cursors[type] = end

  return store
}

const createShadows = (store) => {
  store[$queryShadow] = store.slice(0)
  store[$serializeShadow] = store.slice(0)
}

const isArrayType = x => Array.isArray(x) 
  && typeof x[0] === 'object'
  && x[0].hasOwnProperty('type')
  && x[0].hasOwnProperty('length')

export const createStore = (schema, size=1000000) => {
  const $store = Symbol('store')

  if (schema.constructor.name === 'Map') {
    schema[$storeSize] = size
    return schema
  }

  schema = JSON.parse(JSON.stringify(schema))

  const collectArrayCount = (count, key) => {
    if (isArrayType(schema[key])) {
      count++
    } else if (schema[key] instanceof Object) {
      count += Object.keys(schema[key]).reduce(collectArrayCount, 0)
    }
    return count
  }

  const arrayCount = isArrayType(schema) ? 1 : Object.keys(schema).reduce(collectArrayCount, 0)

  const metadata = {
    [$storeSize]: size,
    [$storeMaps]: {},
    [$storeSubarrays]: {},
    [$storeRef]: $store,
    [$storeCursor]: 0,
    [$subarrayCursors]: Object.keys(TYPES).reduce((a, type) => ({ ...a, [type]: 0 }), {}),
    [$storeArrayCount]: arrayCount,
    [$storeFlattened]: []
  }

  if (schema instanceof Object && Object.keys(schema).length) {

    const recursiveTransform = (a, k) => {
      
      if (typeof a[k] === 'string') {

        a[k] = createTypeStore(a[k], size)
        a[k][$storeBase] = () => stores[$store]
        metadata[$storeFlattened].push(a[k])
        createShadows(a[k])

      } else if (isArrayType(a[k])) {
        
        const { type, length } = a[k][0]
        a[k] = createArrayStore(metadata, type, length)
        a[k][$storeBase] = () => stores[$store]
        metadata[$storeFlattened].push(a[k])

      } else if (a[k] instanceof Object) {
        
        a[k] = Object.keys(a[k]).reduce(recursiveTransform, a[k])
        
      }
      
      return a
    }

    stores[$store] = Object.assign(Object.keys(schema).reduce(recursiveTransform, schema), metadata)
    stores[$store][$storeBase] = () => stores[$store]

    return stores[$store]

  }

  return {}
}

export const free = (store) => {
  delete stores[store[$storeRef]]
}