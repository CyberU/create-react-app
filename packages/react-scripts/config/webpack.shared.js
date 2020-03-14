const webpack = require('webpack');
const path = require('path');
const moment = require('moment');
const fs = require('fs');
const http = require('http');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const CompressionPlugin = require('compression-webpack-plugin');
const CheckerPlugin = require('awesome-typescript-loader').CheckerPlugin;
const CleanWebpackPlugin = require('clean-webpack-plugin');
const CleanUpStatsPlugin = require('clean-up-extract-text-plugin-output');
// const WebpackGitHash = require('webpack-git-hash');
const StatsPlugin = require('stats-webpack-plugin');
const ProgressBarPlugin = require('progress-bar-webpack-plugin');
const AirbrakePlugin = require('webpack-airbrake-private-sourcemaps');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer')
  .BundleAnalyzerPlugin;

// when true this will open up the bundle analyzer
const SHOW_ANALYZER = false;

// determine if build is for dev or prod
const isDevBuild = process.argv.indexOf('--env.prod') === -1;

// create date string for file banners
const dateStr = moment().format('dddd, MMMM Do YYYY, h:mm:ss a');

// configure local ident name
const LOCAL_IDENT_NAME = '[name]-[local]-[path]';

// directories
const outputDirStr = './wwwroot/dist';
const outputDir = path.join(__dirname, outputDirStr);
const resolvedDir = path.resolve(__dirname);

/**
 * Use this type of hash for cache busting
 * @type {string}
 */
const fileNameHashType = 'chunkhash'; //'githash';

// =========================================
//
// entry points
//
// =========================================

const utils = (function(dev) {
  return {
    getFileName: function(filenameBase) {
      if (dev) {
        return `${filenameBase}.js`;
      } else {
        return `${filenameBase}.[${fileNameHashType}].js`;
      }
    },
    /**
     * Get an array of files that should be included in entry point.
     * @param isDev - boolean
     * @returns Array
     *
     * This entry modules specific order is needed due to this IE11 issue https://github.com/facebook/react/issues/8379#issuecomment-273489824
     */

    /*
        I DON'T REMEMBER WHY I'M INJECTING ALL OF THE VENDORS FILES IN THE ENTRY POINT :(
        TODO: Can we remove VENDOR_PACKAGES concatenation?
     */
    getEntryPointsArray: function() {
      if (dev) {
        return [
          'babel-polyfill',
          'react-hot-loader/patch',
          './ClientApp/boot-client.tsx',
        ];
      } else {
        return ['babel-polyfill', './ClientApp/boot-client.tsx'];
      }
    },

    /**
     * Get array of plugins.
     * @param isDev
     * @returns {*}
     */
    getClientPlugins: function() {
      const basePlugins = [
        plugins.cleanWebpackPlugin,
        plugins.hashedModuleIdsPlugin,
        plugins.commonsChunkPluginMain,
        plugins.commonsChunkPluginVendor,
        plugins.commonsChunkPluginBootup,
        plugins.sourceMapToolPlugin,
        // plugins.concatenatePlugin, // this apparently doesn't do anything unless you disable module processing in transpiler
        plugins.providePlugin,
        plugins.cleanUpStatsPlugin,
        //webpackGitHashPlugin
      ];

      if (SHOW_ANALYZER) {
        basePlugins.push(plugins.bundleAnalyzerPlugin);
      }

      if (dev) {
        basePlugins.push(plugins.progressBarPlugin);
        return basePlugins;
      } else {
        return basePlugins.concat([
          plugins.uglifyJsPlugin,
          plugins.compressPlugin,
          plugins.airbrakePlugin,
        ]);
      }
    },

    /**
     * Get array of plugins.
     * @returns {*}
     */
    getPreparatoryScriptPlugins: function() {
      const basePlugins = [plugins.providePlugin, plugins.cleanUpStatsPlugin];

      if (SHOW_ANALYZER) {
        basePlugins.push(plugins.bundleAnalyzerPlugin);
      }

      if (dev) {
        basePlugins.push(plugins.progressBarPlugin);
        return basePlugins;
      } else {
        return basePlugins.concat([
          plugins.uglifyJsPlugin,
          plugins.compressPlugin,
        ]);
      }
    },
  };
})(isDevBuild);

// =========================================
//
// loaders
//
// putting them in an object so it can be collapsed
//
// =========================================

const loaders = {
  // javascript compilation
  jsLoader: {
    test: /\.js?$/,
    include: /ClientApp/,
    use: {
      loader: 'babel-loader',
      options: {
        presets: ['es2015', 'react', 'stage-0'],
        cacheDirectory: true,
        plugins: [
          'transform-decorators-legacy',
          'transform-class-properties',
          'transform-runtime',
        ],
      },
    },
  },

  // typescript compilation
  tsxLoader: {
    test: /^(?!.*\.test\.tsx?$).*\.ts(x)?$/,
    exclude: ['node_modules'],
    use: [
      {
        loader: 'awesome-typescript-loader',
        options: {
          silent: true,
          useBabel: true,
          useCache: true,
          babelOptions: {
            babelrc: true,
          },
        },
      },
    ],
  },

  // typescript linting
  tsLintLoader: {
    test: /^(?!.*\.test\.tsx?$).*\.tsx?$/,
    exclude: ['node_modules'],
    enforce: 'pre',
    loader: 'tslint-loader',
    options: {
      emitErrors: true,
    },
  },

  // css handling
  cssLoader: {
    test: /\.css$/,
    use: ExtractTextPlugin.extract({
      use: [
        {
          loader: 'css-loader',
          options: {
            minimize: !isDevBuild,
            sourceMap: isDevBuild,
          },
        },
      ],
    }),
  },

  // scss handling
  scssLoader: {
    test: /\.scss$/,
    use: ExtractTextPlugin.extract({
      use: [
        {
          loader: 'css-loader',
          options: {
            minimize: !isDevBuild,
            sourceMap: false, // isDevBuild, // disabling to help performance
          },
        },
        {
          loader: 'autoprefixer-loader',
          options: {
            browsers: ['last 20 version', 'ff > 15', 'ie 9', 'ie 10'],
          },
        },
        'sass-loader',
      ],
    }),
  },

  // image handling
  imageLoader: {
    test: /\.(png|jpg|jpeg|gif|svg)$/,
    loader: 'url-loader?limit=25000',
    exclude: [path.resolve(__dirname, './ClientApp/icons')],
  },

  // font file handling
  fontLoader: {
    test: /\.(eot|svg|ttf|woff|woff2)$/,
    loader: 'file-loader',
    exclude: [path.resolve(__dirname, './ClientApp/icons')],
    options: {
      name: 'fonts/[name].[ext]',
    },
  },

  // image font handling
  imageFontLoader: {
    test: /\.(png|woff|woff2|eot|ttf|svg)(\?|$)/,
    loader: 'url-loader?limit=100000',
    exclude: [path.resolve(__dirname, './ClientApp/icons')],
  },

  //https://github.com/svg/svgo
  // leaving this here because it could be useful
  reactSVGIconLoader: {
    test: /\.svg$/,
    include: [path.resolve(__dirname, './ClientApp/icons')],
    use: [
      {
        loader: 'babel-loader',
      },
      {
        loader: 'react-svg-loader',
        options: {
          jsx: true,
          svgo: {
            removeTitle: true,
          },
        },
      },
    ],
  },

  rawSVGLoader: {
    test: /\.svg$/,
    include: [path.resolve(__dirname, './ClientApp/icons')],
    use: [
      { loader: 'raw-loader' },
      {
        loader: 'svgo-loader',
        options: {
          plugins: [
            { removeTitle: true },
            { removeComments: true },
            { removeDesc: true },
            { removeXMLNS: true },
            { removeViewBox: false },
            { removeDimensions: true },
          ],
        },
      },
    ],
  },
};

/*
 * Airbrake plugin setup
 */
const settings = JSON.parse(fs.readFileSync('./appsettings.json', 'utf8'));
const { Airbrake } = settings;
const sourcemapsRoot = `${__dirname}/wwwroot/dist`;

// =========================================
//
// Plugins
//
// =========================================

const plugins = {
  // This should hopefully put all shared modules in a separate file.

  // doing this just renames the main-client to vendor.  It doesn't split the code.
  // it does seem to successfully move all shared bundles to that file though.
  commonsChunkPluginVendor: new webpack.optimize.CommonsChunkPlugin({
    name: 'commons',
    filename: utils.getFileName('vendors'),
    //minChunks: 1,
    minChunks: function(module, count) {
      // keep the css in the main chunk so it can be extracted
      if (module.resource && /^.*\.(css|scss)$/.test(module.resource)) {
        return false;
      }

      // this assumes your vendor imports exist in the node_modules directory
      return module.context && module.context.includes('node_modules');
    },
  }),

  commonsChunkPluginMain: new webpack.optimize.CommonsChunkPlugin({
    name: 'main',
    filename: utils.getFileName('main'),
    minChunks: function(module, count) {
      // this assumes your vendor imports exist in the node_modules directory
      return (
        module.context && !module.context.includes('node_modules') && count > 1
      );
    },
    children: true,
    deepChildren: true,
  }),

  // this should should create a chunk with the manifest that can screw up chunkhash values.
  // if this isn't split out then the vendors file will be recompiled every time.
  // https://webpack.js.org/guides/caching/
  commonsChunkPluginBootup: new webpack.optimize.CommonsChunkPlugin({
    name: 'bootstrap',
    filename: utils.getFileName('bootstrap'), //'bootstrap.js' bootstrap should always be reloaded
  }),

  concatenatePlugin: new webpack.optimize.ModuleConcatenationPlugin(),

  // remove the dist directory
  cleanWebpackPlugin: new CleanWebpackPlugin(['wwwroot/dist'], {
    verbose: true,
    exclude: [],
  }),

  // create the sources maps?
  sourceMapToolPlugin: (function(isDev) {
    let options;

    if (isDev) {
      options = {
        filename: '[file].map', // Remove this line if you prefer inline source maps
        moduleFilenameTemplate: path.relative(outputDirStr, '[resourcePath]'), // Point sourcemap entries to the original file locations on disk
      };
    } else {
      options = {
        filename: 'sourcemaps/[file].map', // Remove this line if you prefer inline source maps
        moduleFilenameTemplate: path.relative(outputDirStr, '[resourcePath]'), // Point sourcemap entries to the original file locations on disk
        fileContext: 'dist',
      };
    }

    return new webpack.SourceMapDevToolPlugin(options);
  })(isDevBuild),

  // Use githash to name files.
  // webpackGitHashPlugin: new WebpackGitHash(),

  // uglify the result
  uglifyJsPlugin: new webpack.optimize.UglifyJsPlugin({
    sourceMap: true,
  }),

  // compress the result
  compressPlugin: new CompressionPlugin(),

  // run bundle analyzer
  bundleAnalyzerPlugin: new BundleAnalyzerPlugin({
    defaultSizes: 'gzip',
    // generateStatsFile: true
  }),

  // define the environment to eject
  definePlugin: new webpack.DefinePlugin({
    'process.env.NODE_ENV': isDevBuild ? '"development"' : '"production"',
  }),

  checkerPlugin: new CheckerPlugin(),

  // extract the css from the output
  extractTextPlugin: new ExtractTextPlugin({
    filename: 'site.css', // TODO: This is being cachebusted with .NET Core's process. Should we use webpack instead?
    allChunks: true,
  }),

  // add a banner to output
  bannerPlugin: new webpack.BannerPlugin({
    banner: `[name].[chunkhash] ${dateStr}`,
    entryOnly: false,
  }),

  // use a hash for webpack indexes rather than numeric keys
  hashedModuleIdsPlugin: new webpack.HashedModuleIdsPlugin({
    hashDigestLength: 10,
  }),

  providePlugin: new webpack.ProvidePlugin({
    $: 'jquery',
    jQuery: 'jquery',
  }),

  progressBarPlugin: new ProgressBarPlugin(),

  airbrakePlugin: new AirbrakePlugin({
    projectId: Airbrake.ProjectId,
    projectKey: Airbrake.ProjectKey,
    host: settings.Hosts.Ui.HostName,
    directories: ['wwwroot/dist', 'wwwroot/dist/sourcemaps'],
  }),

  cleanUpStatsPlugin: new CleanUpStatsPlugin(),
};

/*
const statsPlugin = new StatsPlugin('stats.json', {
    chunkModules: true
});
*/

/**
 * Configuration in common to both client-side and server-side bundles
 */
const isomorphicConfig = {
  cache: true,
  resolve: {
    modules: [resolvedDir, 'node_modules'],
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    alias: {
      jquery: 'jquery/src/jquery',
    },
  },
  output: {
    filename: '[name].js',
    publicPath: '/dist/', // Webpack dev middleware, if enabled, handles requests for this URL prefix
  },
  module: {
    rules: [
      // js + typescript loaders
      loaders.jsLoader,
      loaders.tsLintLoader,
      loaders.tsxLoader,

      // css + scss loaders
      loaders.cssLoader,
      loaders.scssLoader,

      // file handling loaders
      // loaders.reactSVGIconLoader,
      loaders.rawSVGLoader,
      loaders.imageLoader,
      loaders.fontLoader,
    ],
  },
  plugins: [
    plugins.bannerPlugin,
    plugins.definePlugin,
    plugins.checkerPlugin,
    plugins.extractTextPlugin,
  ],
};

/*
 * Exports
 */
module.exports = {
  utils,
  outputDir,
  isDevBuild,
  isomorphicConfig,
  plugins,
  loaders,
};
