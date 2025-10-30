const https = require("https");

// Environment variables
const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO || "ddy-devlopment/cloud";
const FILEPATH = process.env.GITHUB_FILEPATH || "db-products.json";
const BRANCH = process.env.GITHUB_BRANCH || "main";

// Fungsi untuk request ke GitHub API
function githubRequest(path, method = "GET", data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path,
      method,
      headers: {
        "User-Agent": "ProductDash-API",
        Authorization: `token ${TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(body || "{}");
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject({
              statusCode: res.statusCode,
              message: json.message || `GitHub API error: ${res.statusCode}`,
              errors: json.errors,
            });
          }
        } catch (e) {
          reject({
            statusCode: 500,
            message: "JSON parse error",
            details: e.message,
          });
        }
      });
    });

    req.on("error", (error) => {
      reject({
        statusCode: 500,
        message: "Network error",
        details: error.message,
      });
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// Fungsi untuk mendapatkan produk saat ini dari GitHub
async function getCurrentProducts() {
  try {
    const fileData = await githubRequest(`/repos/${REPO}/contents/${FILEPATH}?ref=${BRANCH}`);

    if (!fileData.content) {
      return { products: [], sha: null };
    }

    const content = Buffer.from(fileData.content, "base64").toString("utf8");
    return {
      products: JSON.parse(content),
      sha: fileData.sha,
    };
  } catch (error) {
    if (error.statusCode === 404) {
      return { products: [], sha: null };
    }
    throw error;
  }
}

// Fungsi untuk update file di GitHub
async function updateGitHubFile(products, message, sha) {
  const updatePayload = {
    message,
    content: Buffer.from(JSON.stringify(products, null, 2)).toString("base64"),
    branch: BRANCH,
  };

  if (sha) {
    updatePayload.sha = sha;
  }

  return githubRequest(`/repos/${REPO}/contents/${FILEPATH}`, "PUT", updatePayload);
}

// Generate ID unik ala Shopee
function generateProductId() {
  const shopId = Math.floor(100000 + Math.random() * 900000);
  const itemId = Math.floor(Date.now() / 10).toString().slice(-9);
  return `i.${shopId}.${itemId}`;
}

// Validasi data produk sesuai struktur yang diminta
function validateProductData(product, isUpdate = false) {
  const errors = [];

  // Validasi field wajib untuk produk baru
  if (!isUpdate) {
    if (!product.nama || product.nama.trim() === "") {
      errors.push("Nama produk harus diisi");
    }
    if (!product.deskripsi_singkat || product.deskripsi_singkat.trim() === "") {
      errors.push("Deskripsi singkat harus diisi");
    }
    if (!product.deskripsi_lengkap || product.deskripsi_lengkap.trim() === "") {
      errors.push("Deskripsi lengkap harus diisi");
    }
  }

  // Validasi stok
  if (product.stok && !["in-stock", "low-stock", "out-of-stock"].includes(product.stok)) {
    errors.push("Status stok harus in-stock, low-stock, atau out-of-stock");
  }

  // Validasi jumlah terjual
  if (product.terjual !== undefined && product.terjual !== null) {
    if (isNaN(product.terjual) || product.terjual < 0) {
      errors.push("Jumlah terjual harus berupa angka positif");
    }
  }

  // Validasi rating - PERBAIKAN: tambahkan validasi rating
  if (product.rating !== undefined && product.rating !== null) {
    if (isNaN(product.rating) || product.rating < 1 || product.rating > 5) {
      errors.push("Rating harus berupa angka antara 1 hingga 5");
    }
  }

  // Validasi varian
  if (product.varian) {
    if (!Array.isArray(product.varian)) {
      errors.push("Varian harus berupa array");
    } else if (product.varian.length === 0 && !isUpdate) {
      errors.push("Produk harus memiliki minimal satu varian");
    } else {
      product.varian.forEach((variant, index) => {
        if (!variant.name || variant.name.trim() === "") {
          errors.push(`Varian ${index + 1}: Nama varian harus diisi`);
        }
        if (variant.harga_asli === undefined || variant.harga_asli === null) {
          errors.push(`Varian ${index + 1}: Harga asli harus diisi`);
        } else if (isNaN(variant.harga_asli) || variant.harga_asli < 0) {
          errors.push(`Varian ${index + 1}: Harga asli harus berupa angka positif`);
        }
        if (variant.harga_diskon === undefined || variant.harga_diskon === null) {
          // Jika harga diskon tidak diisi, set sama dengan harga asli
          variant.harga_diskon = variant.harga_asli;
        } else if (isNaN(variant.harga_diskon) || variant.harga_diskon < 0) {
          errors.push(`Varian ${index + 1}: Harga diskon harus berupa angka positif`);
        }
      });
    }
  }

  return errors;
}

// Fungsi untuk menambahkan nilai default sesuai struktur yang diminta
function applyDefaults(product, isNew = false) {
  if (isNew) {
    // Untuk produk baru, set default jika tidak disertakan
    if (product.terjual === undefined) product.terjual = 0;
    if (product.rating === undefined) product.rating = 5; // Default rating 5
    if (!product.gambar) product.gambar = "";
    if (!product.stok) product.stok = "in-stock";
  }

  // Pastikan tipe data benar
  if (product.terjual !== undefined && typeof product.terjual !== "number") {
    product.terjual = parseInt(product.terjual) || 0;
  }
  if (product.rating !== undefined && typeof product.rating !== "number") {
    product.rating = parseFloat(product.rating) || 5;
  }

  // PERBAIKAN: Batasi rating antara 1-5 (bukan 0-5)
  if (product.rating !== undefined) {
    if (product.rating < 1) product.rating = 1;
    if (product.rating > 5) product.rating = 5;
    
    // Bulatkan rating ke 1 desimal
    product.rating = Math.round(product.rating * 10) / 10;
  }

  // Pastikan varian memiliki harga_diskon default jika tidak disertakan
  if (product.varian && Array.isArray(product.varian)) {
    product.varian.forEach(variant => {
      if (variant.harga_diskon === undefined || variant.harga_diskon === null) {
        variant.harga_diskon = variant.harga_asli;
      }
      // Pastikan tipe data harga benar
      if (typeof variant.harga_asli !== "number") {
        variant.harga_asli = parseFloat(variant.harga_asli) || 0;
      }
      if (typeof variant.harga_diskon !== "number") {
        variant.harga_diskon = parseFloat(variant.harga_diskon) || variant.harga_asli;
      }
    });
  }

  return product;
}

// Main function
module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Check GitHub token
  if (!TOKEN) {
    return res.status(500).json({
      error: "Missing GitHub token. Set GITHUB_TOKEN environment variable.",
    });
  }

  try {
    // GET: Return all products
    if (req.method === "GET") {
      const { products } = await getCurrentProducts();
      
      // Add URL untuk setiap produk jika belum ada
      const productsWithUrls = products.map(product => {
        if (!product.url) {
          product.url = `https://${req.headers.host}/product/${product.id}`;
        }
        return product;
      });
      
      return res.status(200).json(productsWithUrls || []);
    }

    // POST: Add new product
    if (req.method === "POST") {
      let newProduct;
      
      try {
        newProduct = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      } catch (parseError) {
        return res.status(400).json({
          error: "Invalid JSON format in request body",
          details: parseError.message,
        });
      }

      // Validasi data produk
      const validationErrors = validateProductData(newProduct, false);
      if (validationErrors.length > 0) {
        return res.status(400).json({
          error: "Data produk tidak valid",
          details: validationErrors,
        });
      }

      // Apply defaults
      applyDefaults(newProduct, true);

      // Generate ID dan URL (tanpa timestamps)
      newProduct.id = generateProductId();
      newProduct.url = `https://${req.headers.host}/product/${newProduct.id}`;

      // Get current products
      const { products, sha } = await getCurrentProducts();
      const updatedProducts = [...products, newProduct];

      // Update file di GitHub
      await updateGitHubFile(updatedProducts, `Tambah produk: ${newProduct.nama}`, sha);

      return res.status(201).json({
        success: true,
        message: "Produk berhasil ditambahkan",
        product: newProduct,
      });
    }

    // PUT: Update existing product
    if (req.method === "PUT") {
      const productId = req.query.id;
      
      if (!productId) {
        return res.status(400).json({ 
          error: "ID produk diperlukan sebagai query parameter" 
        });
      }

      let updatedData;
      
      try {
        updatedData = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      } catch (parseError) {
        return res.status(400).json({
          error: "Invalid JSON format in request body",
          details: parseError.message,
        });
      }

      // Get current products
      const { products, sha } = await getCurrentProducts();

      // Find product index
      const productIndex = products.findIndex((p) => p.id === productId);
      if (productIndex === -1) {
        return res.status(404).json({ 
          error: "Produk tidak ditemukan" 
        });
      }

      // Validasi data produk (untuk update)
      const validationErrors = validateProductData(updatedData, true);
      if (validationErrors.length > 0) {
        return res.status(400).json({
          error: "Data produk tidak valid",
          details: validationErrors,
        });
      }

      // Update product - preserve existing fields that aren't being updated
      const existingProduct = products[productIndex];
      const updatedProduct = {
        ...existingProduct,
        ...updatedData,
        // Ensure ID and URL don't change
        id: existingProduct.id,
        url: existingProduct.url
      };

      // Apply defaults untuk field yang mungkin belum ada
      applyDefaults(updatedProduct);

      // Validasi final product
      const finalValidationErrors = validateProductData(updatedProduct, false);
      if (finalValidationErrors.length > 0) {
        return res.status(400).json({
          error: "Data produk tidak valid setelah update",
          details: finalValidationErrors,
        });
      }

      products[productIndex] = updatedProduct;

      // Update file di GitHub
      await updateGitHubFile(products, `Update produk: ${updatedProduct.nama}`, sha);

      return res.status(200).json({
        success: true,
        message: "Produk berhasil diperbarui",
        product: updatedProduct,
      });
    }

    // DELETE: Delete product
    if (req.method === "DELETE") {
      const productId = req.query.id;

      if (!productId) {
        return res.status(400).json({ 
          error: "ID produk diperlukan sebagai query parameter" 
        });
      }

      // Get current products
      const { products, sha } = await getCurrentProducts();

      // Find product index
      const productIndex = products.findIndex((p) => p.id === productId);
      if (productIndex === -1) {
        return res.status(404).json({ 
          error: "Produk tidak ditemukan" 
        });
      }

      // Remove product
      const [deletedProduct] = products.splice(productIndex, 1);

      // Update file di GitHub
      await updateGitHubFile(products, `Hapus produk: ${deletedProduct.nama}`, sha);

      return res.status(200).json({
        success: true,
        message: "Produk berhasil dihapus",
        product: deletedProduct,
      });
    }

    // Method not allowed
    return res.status(405).json({
      error: "Method not allowed. Supported methods: GET, POST, PUT, DELETE",
    });

  } catch (error) {
    console.error("API Error:", error);
    
    // Handle specific GitHub API errors
    let statusCode = error.statusCode || 500;
    let errorMessage = error.message || "Internal server error";
    
    if (error.message.includes("401") || error.message.includes("Bad credentials")) {
      statusCode = 500;
      errorMessage = "Authentication failed with GitHub - check GITHUB_TOKEN";
    } else if (error.message.includes("403") || error.message.includes("rate limit")) {
      statusCode = 429;
      errorMessage = "GitHub API rate limit exceeded";
    } else if (error.message.includes("404")) {
      statusCode = 404;
      errorMessage = "Repository or file not found - check GITHUB_REPO and GITHUB_FILEPATH";
    }

    return res.status(statusCode).json({
      error: errorMessage,
      details: error.details || error.errors || "No additional details",
    });
  }
};