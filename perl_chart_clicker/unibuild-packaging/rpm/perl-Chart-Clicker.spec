%{!?perl_vendorlib: %define perl_vendorlib %(eval "`%{__perl} -V:installvendorlib`"; echo $installvendorlib)}

Name:           perl-Chart-Clicker
Version:        2.90
Release:        1%{?dist}
Summary:        Powerful, extensible charting
License:        GPL+ or Artistic
Group:          Development/Libraries
URL:            http://search.cpan.org/dist/Chart-Clicker/
Source0:        Chart-Clicker-%{version}.tar.gz
BuildRoot:      %{_tmppath}/%{name}-%{version}-%{release}-root-%(%{__id_u} -n)
BuildArch:      noarch
BuildRequires:  perl(Carp)
BuildRequires:  perl(Class::Load)
BuildRequires:  perl(Color::Scheme)
BuildRequires:  perl(DateTime)
BuildRequires:  perl(DateTime::Set)
BuildRequires:  perl(English)
BuildRequires:  perl(ExtUtils::MakeMaker)
BuildRequires:  perl(Geometry::Primitive::Arc)
BuildRequires:  perl(Geometry::Primitive::Circle)
BuildRequires:  perl(Geometry::Primitive::Point)
BuildRequires:  perl(Graphics::Color::RGB)
BuildRequires:  perl(Graphics::Primitive::Border)
BuildRequires:  perl(Graphics::Primitive::Brush)
BuildRequires:  perl(Graphics::Primitive::Canvas)
BuildRequires:  perl(Graphics::Primitive::Component)
BuildRequires:  perl(Graphics::Primitive::Container)
BuildRequires:  perl(Graphics::Primitive::Driver::Cairo)
BuildRequires:  perl(Graphics::Primitive::Font)
BuildRequires:  perl(Graphics::Primitive::Insets)
BuildRequires:  perl(Graphics::Primitive::Operation::Fill)
BuildRequires:  perl(Graphics::Primitive::Operation::Stroke)
BuildRequires:  perl(Graphics::Primitive::Oriented)
BuildRequires:  perl(Graphics::Primitive::Paint::Gradient::Linear)
BuildRequires:  perl(Graphics::Primitive::Paint::Gradient::Radial)
BuildRequires:  perl(Graphics::Primitive::Paint::Solid)
BuildRequires:  perl(Graphics::Primitive::Path)
BuildRequires:  perl(Graphics::Primitive::TextBox)
BuildRequires:  perl(Layout::Manager::Absolute)
BuildRequires:  perl(Layout::Manager::Axis)
BuildRequires:  perl(Layout::Manager::Compass)
BuildRequires:  perl(Layout::Manager::Flow)
BuildRequires:  perl(Layout::Manager::Grid)
BuildRequires:  perl(Layout::Manager::Single)
BuildRequires:  perl(List::Util)
BuildRequires:  perl(Math::Trig)
BuildRequires:  perl(Moose)
BuildRequires:  perl(Moose::Role)
BuildRequires:  perl(Moose::Util)
BuildRequires:  perl(Moose::Util::TypeConstraints)
BuildRequires:  perl(POSIX)
BuildRequires:  perl(Scalar::Util)
BuildRequires:  perl(Test::Exception)
BuildRequires:  perl(Test::Fatal)
BuildRequires:  perl(Test::More)
BuildRequires:  perl(constant)
BuildRequires:  perl(strict)
BuildRequires:  perl(warnings)
Requires:       perl(Carp)
Requires:       perl(Class::Load)
Requires:       perl(Color::Scheme)
Requires:       perl(DateTime)
Requires:       perl(DateTime::Set)
Requires:       perl(English)
Requires:       perl(Geometry::Primitive::Arc)
Requires:       perl(Geometry::Primitive::Circle)
Requires:       perl(Geometry::Primitive::Point)
Requires:       perl(Graphics::Color::RGB)
Requires:       perl(Graphics::Primitive::Border)
Requires:       perl(Graphics::Primitive::Brush)
Requires:       perl(Graphics::Primitive::Canvas)
Requires:       perl(Graphics::Primitive::Component)
Requires:       perl(Graphics::Primitive::Container)
Requires:       perl(Graphics::Primitive::Driver::Cairo)
Requires:       perl(Graphics::Primitive::Font)
Requires:       perl(Graphics::Primitive::Insets)
Requires:       perl(Graphics::Primitive::Operation::Fill)
Requires:       perl(Graphics::Primitive::Operation::Stroke)
Requires:       perl(Graphics::Primitive::Oriented)
Requires:       perl(Graphics::Primitive::Paint::Gradient::Linear)
Requires:       perl(Graphics::Primitive::Paint::Gradient::Radial)
Requires:       perl(Graphics::Primitive::Paint::Solid)
Requires:       perl(Graphics::Primitive::Path)
Requires:       perl(Graphics::Primitive::TextBox)
Requires:       perl(Layout::Manager::Absolute)
Requires:       perl(Layout::Manager::Axis)
Requires:       perl(Layout::Manager::Compass)
Requires:       perl(Layout::Manager::Flow)
Requires:       perl(Layout::Manager::Grid)
Requires:       perl(Layout::Manager::Single)
Requires:       perl(List::Util)
Requires:       perl(Math::Trig)
Requires:       perl(Moose)
Requires:       perl(Moose::Role)
Requires:       perl(Moose::Util)
Requires:       perl(Moose::Util::TypeConstraints)
Requires:       perl(POSIX)
Requires:       perl(Scalar::Util)
Requires:       perl(constant)
Requires:       perl(strict)
Requires:       perl(warnings)

Provides:       perl(Chart::Clicker)

%description
Chart::Clicker aims to be a powerful, extensible charting package that
creates really pretty output. Charts can be saved in png, svg, pdf and
postscript format.

%prep
%setup -q -n Chart-Clicker-%{version}

%build
%{__perl} Makefile.PL INSTALLDIRS=vendor
make %{?_smp_mflags}

%install
rm -rf %{buildroot}

make pure_install PERL_INSTALL_ROOT=%{buildroot}

find %{buildroot} -type f -name .packlist -exec rm -f {} \;
find %{buildroot} -depth -type d -exec rmdir {} 2>/dev/null \;

%{_fixperms} %{buildroot}/*

%check || :
make test

%clean
rm -rf %{buildroot}

%files
%defattr(-,root,root,-)
%doc Changes LICENSE META.json README README.mkdn example
%{perl_vendorlib}/*
%{_mandir}/man3/*

%changelog
* Wed Apr 03 2024 Otto J Wittner <otto.wittner@sikt.no> 2.90-1
- Specfile autogenerated by cpanspec 1.78.
