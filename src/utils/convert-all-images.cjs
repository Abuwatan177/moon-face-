const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');
const path = require('path');

// جلب ملف .env.server من المجلد الرئيسي للمشروع بشكل دقيق
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.server') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ خطأ: لم يتم العثور على متغيرات البيئة Supabase URL أو Key. تحقق من ملف .env.server الخاص بك.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const BUCKET_NAME = 'store-media';

async function processAllImages() {
  try {
    console.log('جاري جلب قائمة الصور من دلو التخزين...');
    
    const { data: files, error } = await supabase.storage.from(BUCKET_NAME).list('', {
      limit: 500,
      sortBy: { column: 'name', order: 'asc' }
    });

    if (error) {
      console.error('خطأ في جلب الملفات:', error.message);
      return;
    }

    if (!files || files.length === 0) {
      console.log('لا توجد ملفات في التخزين.');
      return;
    }

    console.log(`تم العثور على ${files.length} ملف. جاري البدء بالمعالجة والتحويل مع تنظيف الملفات القديمة...`);

    for (const file of files) {
      // تخطي الملفات الفارغة أو الـ webp أو مجلدات التخزين الافتراضية
      if (!file.name || file.name.endsWith('.webp') || file.name === '.emptyFolderPlaceholder') {
        continue;
      }

      console.log(`\n--------------------------------------------`);
      console.log(`⏳ معالجة الملف: ${file.name}`);

      try {
        const { data: fileData, error: downloadError } = await supabase.storage
          .from(BUCKET_NAME)
          .download(file.name);

        if (downloadError) {
          console.error(`❌ فشل تحميل الملف ${file.name}:`, downloadError.message);
          continue;
        }

        const arrayBuffer = await fileData.arrayBuffer();
        const inputBuffer = Buffer.from(arrayBuffer);

        const webpBuffer = await sharp(inputBuffer)
          .resize({ width: 1600, withoutEnlargement: true })
          .webp({ quality: 80, effort: 4 })
          .toBuffer();

        const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        const newFileName = `${baseName}.webp`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(newFileName, webpBuffer, {
            contentType: 'image/webp',
            upsert: true,
          });

        if (uploadError) {
          console.error(`❌ فشل رفع الصورة المضغوطة ${newFileName}:`, uploadError.message);
        } else {
          console.log(`✅ تم بنجاح تحويل وضغط: ${file.name} -> ${newFileName}`);
          
          // 🔥 هنا يتم حذف الصورة القديمة غير المضغوطة بعد التأكد من نجاح رفع الجديدة
          console.log(`🗑️ جاري حذف الصورة الأصلية الثقيلة: ${file.name}...`);
          const { error: deleteError } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([file.name]);

          if (deleteError) {
            console.error(`⚠️ فشل حذف الصورة الأصلية ${file.name}:`, deleteError.message);
          } else {
            console.log(`✨ تم تنظيف وحذف الصورة الأصلية بنجاح.`);
          }
        }

      } catch (innerErr) {
        console.error(`💥 حدث خطأ أثناء معالجة الملف ${file.name}:`, innerErr.message);
      }
    }

    console.log('\n🚀 اكتملت عملية معالجة وتنظيف جميع الصور بنجاح!');
  } catch (err) {
    console.error('حدث خطأ عام:', err);
  }
}

processAllImages()
  .then(() => console.log('🏁 انتهت العملية بالكامل!'))
  .catch((err) => console.error('❌ خطأ غير متوقع في التشغيل الرئيسي:', err));
