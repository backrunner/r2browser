export function generateUniqueFileName(name: string, existingNames: string[]): string {
  const lastDotIndex = name.lastIndexOf('.')
  const baseName = lastDotIndex > 0 ? name.slice(0, lastDotIndex) : name
  const extension = lastDotIndex > 0 ? name.slice(lastDotIndex) : ''

  let counter = 1
  let newName = `${baseName} (${counter})${extension}`

  while (existingNames.includes(newName)) {
    counter += 1
    newName = `${baseName} (${counter})${extension}`
  }

  return newName
}
