const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Sube un buffer de imagen a Cloudinary
 * @param {Buffer} buffer - Buffer de la imagen
 * @param {string} folder - Carpeta destino en Cloudinary
 * @returns {Promise<string>} - URL segura de la imagen
 */
const uploadFromBuffer = (buffer, folder = "vouchers") => {
  if (process.env.NODE_ENV === "test") {
    return Promise.resolve(
      `https://res.cloudinary.com/test-cloud/image/upload/v12345/${folder}/test_file.png`,
    );
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "auto" },
      (error, result) => {
        if (result) resolve(result.secure_url);
        else reject(error);
      }
    );
    stream.end(buffer);
  });
};

module.exports = {
  cloudinary,
  uploadFromBuffer,
};
