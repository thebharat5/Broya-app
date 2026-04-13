import fs from 'fs';
import https from 'https';

const url = "https://lh3.googleusercontent.com/d/18sbufkDifaEidqmhXKhaSwFcG6j_nNyv";
const dest = "public/logo.jpg";

https.get(url, (res) => {
  if (res.statusCode === 302 || res.statusCode === 303) {
    https.get(res.headers.location, (res2) => {
      const file = fs.createWriteStream(dest);
      res2.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log("Downloaded");
      });
    });
  } else {
    const file = fs.createWriteStream(dest);
    res.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log("Downloaded");
    });
  }
});
