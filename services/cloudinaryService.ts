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

const estanCredencialesConfiguradas = () => {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
};

/**
 * Sube una imagen de producto a Cloudinary en la carpeta <BRAND_NAME>/productos
 * @param {Buffer} buffer - Buffer de la imagen
 * @returns {Promise<{ url: string, publicId: string }>}
 */
const subirImagenProducto = async (buffer) => {
  // Solo para las pruebas: simula una instalación sin credenciales
  if (process.env.NODE_ENV === "test" && process.env.FORZAR_CLOUDINARY_DESCONFIGURADO === "true") {
    throw new Error("Cloudinary no está configurado");
  }

  if (process.env.NODE_ENV === "test") {
    const brand = process.env.BRAND_NAME || "default";
    const publicId = `${brand}/productos/mock_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    return {
      url: `https://res.cloudinary.com/test-cloud/image/upload/v12345/${publicId}.png`,
      publicId,
    };
  }

  if (!estanCredencialesConfiguradas()) {
    throw new Error("Cloudinary no está configurado");
  }

  const brand = process.env.BRAND_NAME || "default";
  const folder = `${brand}/productos`;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (error, result) => {
        if (result) {
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        } else {
          reject(error);
        }
      }
    );
    stream.end(buffer);
  });
};

/**
 * Sube una imagen del banner lateral de la tienda a la carpeta <BRAND_NAME>/banner.
 * @param {Buffer} buffer - Buffer de la imagen (JPG, PNG o WebP; la ruta ya lo valida)
 * @returns {Promise<{ url: string, publicId: string }>}
 */
const subirImagenBanner = async (buffer) => {
  if (process.env.NODE_ENV === "test" && process.env.FORZAR_CLOUDINARY_DESCONFIGURADO === "true") {
    throw new Error("Cloudinary no está configurado");
  }

  if (process.env.NODE_ENV === "test") {
    const brand = process.env.BRAND_NAME || "default";
    const publicId = `${brand}/banner/mock_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    return {
      url: `https://res.cloudinary.com/test-cloud/image/upload/v12345/${publicId}.png`,
      publicId,
    };
  }

  if (!estanCredencialesConfiguradas()) {
    throw new Error("Cloudinary no está configurado");
  }

  const brand = process.env.BRAND_NAME || "default";
  const folder = `${brand}/banner`;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (error, result) => {
        if (result) {
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        } else {
          reject(error);
        }
      }
    );
    stream.end(buffer);
  });
};

/**
 * True si el publicId está dentro de la carpeta de banner de esta marca.
 * Se usa antes de borrar: nunca se borra una imagen ajena (p. ej. la de un producto).
 */
const esPublicIdDeBanner = (publicId) => {
  if (typeof publicId !== "string" || !publicId) return false;
  const brand = process.env.BRAND_NAME || "default";
  return publicId.startsWith(`${brand}/banner/`);
};

/**
 * Sube el logo de una empresa de envío (F2f) a la carpeta <BRAND_NAME>/envios.
 * @param {Buffer} buffer - Buffer de la imagen (JPG, PNG o WebP; la ruta ya lo valida)
 * @returns {Promise<{ url: string, publicId: string }>}
 */
const subirLogoEnvio = async (buffer) => {
  // Solo para las pruebas: simula una instalación sin credenciales
  if (process.env.NODE_ENV === "test" && process.env.FORZAR_CLOUDINARY_DESCONFIGURADO === "true") {
    throw new Error("Cloudinary no está configurado");
  }

  if (process.env.NODE_ENV === "test") {
    const brand = process.env.BRAND_NAME || "default";
    const publicId = `${brand}/envios/mock_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    return {
      url: `https://res.cloudinary.com/test-cloud/image/upload/v12345/${publicId}.png`,
      publicId,
    };
  }

  if (!estanCredencialesConfiguradas()) {
    throw new Error("Cloudinary no está configurado");
  }

  const brand = process.env.BRAND_NAME || "default";
  const folder = `${brand}/envios`;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (error, result) => {
        if (result) {
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        } else {
          reject(error);
        }
      }
    );
    stream.end(buffer);
  });
};

/**
 * Elimina una imagen de Cloudinary por su publicId
 * @param {string} publicId - ID público de la imagen
 * @returns {Promise<any>}
 */
const borrarImagen = async (publicId) => {
  // Solo para las pruebas: simula una instalación sin credenciales
  if (process.env.NODE_ENV === "test" && process.env.FORZAR_CLOUDINARY_DESCONFIGURADO === "true") {
    throw new Error("Cloudinary no está configurado");
  }

  if (process.env.NODE_ENV === "test") {
    return { result: "ok" };
  }

  if (!estanCredencialesConfiguradas()) {
    throw new Error("Cloudinary no está configurado");
  }

  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, { resource_type: "image" }, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
};

module.exports = {
  cloudinary,
  uploadFromBuffer,
  subirImagenProducto,
  subirLogoEnvio,
  subirImagenBanner,
  esPublicIdDeBanner,
  borrarImagen,
  estanCredencialesConfiguradas,
};
