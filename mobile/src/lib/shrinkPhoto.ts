import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// Снимок с камеры телефона — 3–4 тысячи точек по стороне и 2–3 МБ. Для
// показаний одометра хватает 1280 точек по длинной стороне (0,2–0,3 МБ):
// фото в разы быстрее уходит по мобильной сети и занимает в разы меньше
// места на сервере — при тысяче водителей с фото каждый день исходные
// снимки заполнили бы диск сервера за несколько недель.
const MAX_SIDE = 1280;

export async function shrinkPhoto(uri: string): Promise<string> {
  // Размер берём у уже загруженного снимка, а не у камеры: так учтён
  // поворот телефона (портретный снимок уменьшаем по высоте).
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const context = ImageManipulator.manipulate(original);
  if (Math.max(original.width, original.height) > MAX_SIDE) {
    context.resize(original.width >= original.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const image = await context.renderAsync();
  const result = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  return result.uri;
}
