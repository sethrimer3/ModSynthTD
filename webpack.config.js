const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const packageJson = require('./package.json');

module.exports = {
  entry: './src/main.ts',
  output: {
    filename: 'bundle.[contenthash].js',
    clean: true
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            onlyCompileBundledFiles: true
          }
        },
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(ttf|woff|woff2|eot|otf)$/i,
        type: 'asset/resource'
      },
      {
        test: /\.(png|jpg|gif|svg|webp)$/i,
        type: 'asset/resource'
      },
      {
        test: /\.(mp3|wav|ogg|flac)$/i,
        type: 'asset/resource'
      },
      {
        test: /\.mid$/i,
        type: 'asset/resource'
      }
    ]
  },
  plugins: [
    new webpack.DefinePlugin({
      __APP_VERSION__: JSON.stringify(packageJson.version),
      __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    }),
    new HtmlWebpackPlugin({
      templateContent: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="theme-color" content="#05070d" />
    <title>ModSynth TD</title>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>`
    })
  ]
};
